"use client";

import Image from "next/image";
import { useState, useCallback, useRef, useEffect, memo } from "react";
import { TalkingHeadAvatar, type TalkingHeadHandle } from "./TalkingHeadAvatar";
import { Webcam, WebcamRef } from "./Webcam";
import { MicWaveform } from "./MicWaveform";
import { useAvatarState } from "@/hooks/useAvatarState";
import { useHandRaiseDetection } from "@/hooks/useHandRaiseDetection";
import {
  useInterviewFaceDetection,
  useInterviewObjectDetection,
  useInterviewProctoringMonitor,
  InterviewProctoringWarnings,
  EnvironmentVerificationOverlay,
  type DetectedObjectEvent,
  type ObjectEventType,
} from './proctoring';
import { CandidateInterviewInfo, candidateAIInterviewService, getAiClientSessionId } from "@/lib/services/candidateAIInterviewService";
import { startClientLogForwarder, stopClientLogForwarder, flushClientLogBeacon } from "./clientLogForwarder";
import SectionTransitionOverlay from "./SectionTransitionOverlay";
import { toast } from 'sonner';
import { requestFullscreen, getFullscreenChangeEvent, exitFullscreen } from "@/lib/utils/browserCompat";
import { Clock, Timer, LogOut, Mic, MessageSquare, ShieldCheck, MicOff, SkipForward, Maximize, RefreshCw, PictureInPicture2, Camera, Monitor, Loader2 } from "lucide-react";
import { createAvatar3DSender } from "./avatar3d/avatar3d-channel";
import { DEFAULT_VISEME_WEIGHTS } from "./avatar3d/avatar3d-types";
import { VisemeTimeline } from "./avatar3d/text-to-viseme";
import { isFlexibleDuration, modeFromConfig } from "@/lib/constants/aiInterviewMode";
import { isTranscriptMeaningful } from "@/lib/utils/whisperFilter";
import { detectDeviceCapability, type DeviceCapability } from "@/lib/utils/deviceCapability";
// Side-effect import: arms the global unhandledrejection guard that silences
// TF.js backend crashes AND benign browser-extension "message channel closed"
// noise. Idempotent — safe even though face-verification also imports it.
import "@/lib/tfjs-rejection-guard";

interface FaceVerificationHandle {
  startVerification: (videoElement: HTMLVideoElement, intervalMs?: number) => void;
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
  // Fired the moment the server signals the interview reached its NATURAL end
  // (`interview_ended`), i.e. all questions done + farewell. The portal uses
  // this to DISARM fullscreen-exit termination while the completion popup is
  // up — otherwise exiting fullscreen at the "Done" popup would terminate an
  // already-finished interview and block its evaluation.
  onInterviewClosing?: () => void;
  /**
   * Requests the parent portal terminate the interview for a proctoring
   * violation the parent owns the full termination flow for (persisted
   * reason, proctor event, screen-recording tail capture, sticky terminated
   * page) — mirrors the leave-the-screen termination already implemented
   * there. Currently fired only when the microphone stays disconnected
   * through the full 3-minute pause grace window.
   */
  onTerminate?: (reason: string) => void;
  faceVerification?: FaceVerificationHandle;
  voiceVerification?: VoiceVerificationHandle;
  copyPasteBlocking?: boolean;
  onTimerChange?: (state: InterviewTimerSnapshot) => void;
  /** Detected device tier + feature flags (from the system-check step). When
   * omitted, the interview assumes a capable device (all features on). */
  deviceCapability?: DeviceCapability;
  /** Object URL of the candidate's captured identity photo, used for the "You"
   * chat avatar. Null/undefined (e.g. identity step skipped) → the "You" text
   * avatar is shown instead. */
  candidatePhotoUrl?: string | null;
  /**
   * True while the parent portal has an active screen recording detected (BUG09).
   * The interview PAUSES for as long as it stays true: session_pause freezes the
   * backend question timer and cancels Bina's pipeline, a blocking overlay asks
   * the candidate to stop recording, and session_resume replays the interrupted
   * question when it goes false. Never terminates, never drops an answer.
   */
  screenRecordingDetected?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Timer value (seconds remaining) when the candidate stopped speaking — shown as a frozen badge */
  responseTimeSeconds?: number;
  /** IST timestamp string (e.g. "2:34 PM") captured when the message was created */
  timestamp?: string;
  /** True if this assistant message is a follow-up question (bundles a previously-volunteered skill or fires as in-slot validation). NOT rendered in the live chat — the "Follow-up" chip + inline note live ONLY on the post-interview Question Analysis (EvaluationDashboardV2) page. Kept on the Message type because saveAiMessage still stamps it from `question_meta` for round-trip parity. */
  isFollowup?: boolean;
  /** The interview question number this message belongs to. Assistant bubbles are
   *  tagged with the question being asked; user answers (especially late, background-
   *  transcribed ones in the decoupled flow) carry the number of the question they
   *  answered so they can be attached to the right bubble instead of appended at the bottom. */
  questionNumber?: number;
  /** True for candidate-initiated action chips ("Repeat Question" / "Move to
   *  next question") posted into the chat when those buttons are clicked. These
   *  render like a candidate bubble but must NEVER be treated as an answer — the
   *  answer-transcript placement/upgrade logic skips any bubble with this flag so
   *  a later transcript can't overwrite the request text. */
  isActionRequest?: boolean;
}

type ClusterData = import('./SkillCoveragePanel').ClusterData;

type ProctorEventDetails = Record<string, unknown>;
type ProctorEventPayload = {
  event_type: string;
  timestamp?: string;
  severity?: string;
  details?: ProctorEventDetails;
};

type VendorFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResultLike {
  0: BrowserSpeechRecognitionAlternative;
  isFinal: boolean;
}

interface BrowserSpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  // Fires when the engine actually begins capturing mic audio. Used to sync the
  // "Your turn — speak now" popup with the moment live transcription is truly live.
  onaudiostart?: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognitionLike;
}

type InterviewWindow = Window & {
  __interviewAudioContext?: AudioContext;
  /** Delay between a PCM chunk arriving and it becoming AUDIBLE, for the audio
   *  path TalkingHeadAvatar actually took this turn. 0 for its raw Web Audio
   *  fallback (plays immediately); null/undefined means the worklet path, so
   *  TALKING_HEAD_BUFFER_MS applies. Set by TalkingHeadAvatar.streamStart. */
  __interviewAudibleDelayMs?: number | null;
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  __audioFramesDropped?: number;
  __audioFramesSent?: number;
  __audioBytesSent?: number;
  __audioFramesFailed?: number;
};

interface InterviewVadConfig {
  silence_threshold?: number;
  silence_duration_ms?: number;
}


interface InterviewSocketMessage {
  type?: string;
  action?: string;
  buffer_minutes?: number;
  cluster?: string;
  clusters?: ClusterData[];
  coverage_map?: Record<string, unknown>;
  covered?: string[];
  current_cluster_id?: string;
  current_skill?: string;
  duration_minutes?: number;
  duration_seconds?: number;
  elapsed_seconds?: number;
  follow_skills?: string[];
  for_previous_question?: boolean;
  from_cluster?: string;
  global_remaining_seconds?: number;
  hr_topics?: Record<string, string>;
  is_clarification?: boolean;
  is_enhanced?: boolean;
  is_final?: boolean;
  is_follow_up?: boolean;
  is_followup?: boolean;
  kind?: string;
  linda_spoke_seconds?: number;
  live_transcript_enabled?: boolean;
  low_covered?: string[];
  medium_covered?: string[];
  message?: string;
  nice_to_have_skills?: string[];
  prior_messages?: Array<Pick<Message, "role" | "content">>;
  prior_question_count?: number;
  question_count?: number;
  question_number?: number;
  questions_asked?: number;
  realtime_transcription_enabled?: boolean;
  reason?: string;
  remaining_seconds?: number;
  round?: string;
  round_name?: string;
  seconds?: number;
  session_id?: string;
  stt_model?: string;
  text?: string;
  timer_state?: unknown;
  to_cluster?: string;
  token?: string;
  total_questions?: number;
  total_seconds?: number;
  uncovered?: string[];
  vad_config?: InterviewVadConfig;
  [key: string]: unknown;
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string") return error;
  return String(error);
}

/** How long after the candidate's turn opens the "Repeat Question" button stays
 *  clickable. After this window it disables (so a candidate can't reset their
 *  answer clock by repeating mid/late answer). One repeat per question. */
const REPEAT_WINDOW_MS = 30000;

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

// ─────────────────────────────────────────────────────────────────────────
// Phase 1 perf helpers (2026-05-28)
//
// Background: InterviewUI is a single ~6000-line component. Every setState
// in here reconciles the whole tree, including the messages list (which
// grows over the interview) and Bina's live AI bubble. During an AI turn
// the parent fires setState many times per second (token reveal at 80 ms,
// silence/timer ticks, WS audio/JSON events). The fix below isolates the
// two heaviest leaf renders into memoized child components so a parent
// re-render no longer reconciles them when their own props are unchanged.
// No business-logic, audio, WS, or scoring code is touched.
// ─────────────────────────────────────────────────────────────────────────

// Minimum bytes to buffer before flushing a non-final recording segment.
// S3 multipart-upload requires every part except the last to be >= 5 MiB; we add
// a small margin so a slightly-undersized flush can't fail CompleteMultipartUpload.
const RECORDING_MIN_SEGMENT_BYTES = 5 * 1024 * 1024 + 256 * 1024; // ~5.25 MiB
const REVEAL_DEBUG = true;
// The text reveal is anchored to audio playback so caption ≈ voice. But tracking
// the audio position EXACTLY makes the text always trail the word you already
// hear ("voice comes before text"). We reveal this many ms AHEAD of the audio
// clock so each word appears just as/before it's spoken — subtitle-style, which
// reads as tightly in sync instead of laggy. Kept small so text never finishes
// noticeably before the audio.
const REVEAL_LEAD_MS = 550;
// Phase A reveal rate (chars/sec) used until `audio_end` tells us the TRUE total
// audio duration. Prior only — replaced by the previous turn's MEASURED rate
// (chars ÷ actual audio seconds) from the second turn on, so it self-calibrates
// to voice, language and AI_TTS_SPEED instead of trusting a constant.
// 12 rather than the ~14 of a normal-rate voice because the backend ships
// AI_TTS_SPEED = 0.85 (Bina speaks ~15% slower). Deliberately conservative:
// undershooting makes the caption trail slightly, overshooting makes it outrun
// the voice — the exact symptom this system exists to prevent.
const DEFAULT_REVEAL_CPS = 12;
// Safety ceiling on Phase A, NOT a pacer (see startRevealingTokens). The rate
// pacer above governs; this only stops a bad CPS prior from completing the
// bubble before `audio_end` confirms the total.
const PHASE_A_MAX_FRACTION = 0.94;
// TalkingHead's WORKLET path buffers incoming PCM before its speaker goes
// audible. Text reveal must wait this long after the first chunk arrives, else
// the bubble paints while Bina is still silent. 1500ms gives generous headroom
// for network jitter + TalkingHead's internal codec init.
// NOTE: this is an unmeasured estimate, and it is NOT universal — Talking-
// HeadAvatar's raw Web Audio fallback (Edge / audioOnly / avatar-load failure)
// plays chunks immediately, i.e. a delay of 0. Always read the ACTIVE path's
// value via getAudibleDelayMs() rather than using this constant directly.
const TALKING_HEAD_BUFFER_MS = 1500;
// Delay between chunk arrival and audible output for the path TalkingHeadAvatar
// actually took this turn. It publishes 0 for its Web Audio fallback and null
// for the worklet path (see TalkingHeadAvatar.streamStart).
const getAudibleDelayMs = (): number => {
  const v = (window as InterviewWindow).__interviewAudibleDelayMs;
  return typeof v === 'number' && v >= 0 ? v : TALKING_HEAD_BUFFER_MS;
};

const formatTimeMMSS = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// ── DEV: Debug overlay row helper (remove with overlay) ─────────────────
const Row = ({ label, value, color = '#e2e8f0' }: { label: string; value: string; color?: string }) => (
  <div className="flex justify-between gap-2">
    <span style={{ color: '#64748b' }}>{label}</span>
    <span style={{ color }} className="text-right">{value}</span>
  </div>
);

const Section = ({ label }: { label: string }) => (
  <div className="text-purple-300 font-semibold pt-1 pb-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{label}</div>
);

const Bar = ({ pct, color = '#818cf8' }: { pct: number; color?: string }) => (
  <div className="mt-0.5 mb-0.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
  </div>
);

// ── YouAvatar ───────────────────────────────────────────────────────────
// The candidate's chat avatar. Shows their captured identity photo when
// available (photoUrl), else the green "You" text circle. Kept tiny (24px) to
// match Bina's avatar; the photo is cropped to a circle via object-cover.
const YouAvatar = ({ photoUrl }: { photoUrl?: string | null }) => {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt="You"
        className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 shadow-sm ring-1 ring-emerald-300"
      />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
      <span className="text-white text-[8px] font-bold">You</span>
    </div>
  );
};

// ── MessageRow ──────────────────────────────────────────────────────────
// Single chat bubble. Memoized on the immutable `msg` reference. When
// `setMessages([...prev, newMsg])` runs, only the newly-appended msg has a
// new reference; all existing msgs keep the same identity → React.memo's
// default shallow compare skips their render. Before this extraction every
// token-reveal tick (12.5 Hz) re-rendered every prior message bubble.
interface MessageRowProps {
  msg: Message;
  candidatePhotoUrl?: string | null;
}

const MessageRow = (({ msg, candidatePhotoUrl }: MessageRowProps) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[render] MessageRow id=${msg.id}`);
  }
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <p className="text-amber-700 text-xs">{msg.content}</p>
        </div>
      </div>
    );
  }
  if (msg.role === 'user' && msg.isActionRequest) {
    // Candidate quick-action chip (Repeat Question / Next). Rendered as a compact
    // right-aligned request bubble so it's clearly a candidate action, not a
    // spoken answer.
    return (
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <p className="text-sm font-medium">{msg.content}</p>
        </div>
      </div>
    );
  }
  if (msg.role === 'user') {
    return (
      <div className="flex gap-2 flex-row-reverse">
        <YouAvatar photoUrl={candidatePhotoUrl} />
        <div className="max-w-[80%]">
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
                {formatTimeMMSS(msg.responseTimeSeconds)} left
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
    );
  }
  return (
    <div className="flex gap-2">
      <img
        src="/linda-avatar.webp"
        onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }}
        alt="Bina"
        className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5"
      />
      <div className="max-w-[80%]">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-semibold text-purple-600">BINA</span>
        </div>
        <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
          {/* pre-line: keeps the committed opening warm-up (role summary +
              AII16 tips) laid out the same way it streamed. */}
          <p className="text-sm leading-relaxed whitespace-pre-line">{msg.content}</p>
        </div>
        {msg.timestamp && (
          <p className="text-[10px] text-gray-400 mt-0.5">{msg.timestamp}</p>
        )}
      </div>
    </div>
  );
});
const MessageRowMemo = memo(MessageRow);

// ── LiveAIBubble ────────────────────────────────────────────────────────
// Bina's streaming-text bubble (token-reveal at 80 ms). Lifted out of the
// parent JSX so the bubble can re-render on its own without forcing the
// surrounding messages list / chrome to reconcile. React.memo on the
// single `text` prop — when token reveal pushes a new substring, only
// this component renders.
interface LiveAIBubbleProps {
  text: string;
}

const LiveAIBubble = (({ text }: LiveAIBubbleProps) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[render] LiveAIBubble');
  }
  return (
    <div className="flex gap-2">
      <img
        src="/linda-avatar.webp"
        onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }}
        alt="Bina"
        className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5"
      />
      <div className="max-w-[80%]">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-semibold text-purple-600">BINA</span>
        </div>
        <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          {/* pre-line: Bina's opening warm-up carries the AII16 tips as
              newline-separated lines. Questions have no newlines, so this is a
              no-op for every other turn. */}
          <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
        </div>
      </div>
    </div>
  );
});
const LiveAIBubbleMemo = memo(LiveAIBubble);

export function InterviewUI({ token, interviewInfo, onInterviewComplete, onInterviewClosing, onTerminate, faceVerification, voiceVerification, copyPasteBlocking = true, onTimerChange, deviceCapability, candidatePhotoUrl, screenRecordingDetected = false }: InterviewUIProps) {
  // ── Effective device capability ──────────────────────────────────────────
  // The portal detects this at the system-check step, but a RESUMED session (or
  // any entry path that skips system check) arrives with deviceCapability=undefined
  // → lite mode would never activate and a 2-core machine would load the heavy
  // 3D avatar. Fallback: detect it HERE on first render (synchronous useState
  // initializer, so it's ready BEFORE TalkingHead mounts and the audioOnly
  // decision is correct from the very first frame). The ~one-time benchmark
  // (~130ms on a slow CPU) is far cheaper than loading the 3D avatar.
  const [fallbackDeviceCapability] = useState<DeviceCapability | undefined>(() => {
    if (deviceCapability) return undefined; // prop provided → no fallback needed
    if (typeof window === 'undefined') return undefined;
    try {
      const cap = detectDeviceCapability({ runBenchmark: true });
      console.log('[InterviewUI] deviceCapability prop missing — detected locally:', cap.tier, `(cores=${cap.cores}, bench=${cap.benchmarkMs?.toFixed(0)}ms)`);
      return cap;
    } catch {
      return undefined;
    }
  });
  const effectiveDeviceCapability = deviceCapability ?? fallbackDeviceCapability;

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isCandidateTranscriptProcessing, setIsCandidateTranscriptProcessing] = useState(false);
  // Ref mirror so stale-closure re-arm paths (setTimeout, WS handlers) can read
  // the latest value synchronously. Used to block the mic from reopening while a
  // PREVIOUS answer is still being transcribed — otherwise a same-slot second
  // utterance can race the first answer (the "spoke 2 min, mic reopened, said a
  // few words" bug that wiped the real answer).
  const isCandidateTranscriptProcessingRef = useRef(false);
  const [backendLiveTranscriptEnabled, setBackendLiveTranscriptEnabled] = useState(false);
  const [browserSpeechRecognitionSupported, setBrowserSpeechRecognitionSupported] = useState(false);
  const [realtimeTranscriptionEnabled, setRealtimeTranscriptionEnabled] = useState(false);
  const realtimeTranscriptionEnabledRef = useRef(false);
  // When true, the SERVER drives turn-end (provider EndOfTurn). The client must
  // NOT cut the turn on its own silence timer — it stops only on `server_end_turn`.
  const serverEotEnabledRef = useRef(false);
  const [activeMicLabel, setActiveMicLabel] = useState("");
  const [micInputLevel, setMicInputLevel] = useState(0);
  // "Mic input low" warning is SUSTAINED-only: it fires solely after several
  // seconds of continuously low input, never on the normal dips between words.
  // This stops the distracting warning from flashing while the candidate speaks
  // normally (each speech peak resets the clock). See the level loop below.
  const [micInputLow, setMicInputLow] = useState(false);
  const micInputLowRef = useRef(false);
  const lastGoodMicAtRef = useRef<number | null>(null);
  // Sync ref mirror of currentTranscript — the live provider/browser
  // transcript the candidate sees while speaking.
  const currentTranscriptRef = useRef("");
  const liveTranscriptDisplayRef = useRef("");
  const [currentAiText, setCurrentAiText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [lindaAvatarSrc, setLindaAvatarSrc] = useState("/linda-avatar.webp");
  /** True while Bina is currently streaming a question that the backend
   *  flagged as a follow-up (`question_meta` with is_followup=true).
   *  NOT shown in the live chat (no chip, no note) — the Follow-up chip and
   *  inline "Reframed as a follow-up" note live ONLY on the post-interview
   *  Question Analysis page. The ref is still tracked so saveAiMessage can
   *  stamp `isFollowup` onto the saved Message for transcript/eval parity. */
  const isCurrentFollowupRef = useRef(false);

  // Interview closing state
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const [closingReason, setClosingReason] = useState<string>("");

  // Silence detection — "Are you there?" banner (Req 14b)
  const [showSilenceBanner, setShowSilenceBanner] = useState(false);
  const silenceBannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Interview completion modal (Req 16)
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const shouldDisconnectAfterAudioRef = useRef(false);
  // Defer the completion modal until Bina's farewell audio actually ends.
  // Backend sends `interview_completion_message` right after `interview_ended`
  // without waiting for TTS playback to drain — if we show the modal
  // immediately it pops up while Bina is still speaking.
  const pendingCompletionModalRef = useRef(false);

  // 5-minute buffer state (MOM: buffer when allocated time expires)
  const [isInBuffer, setIsInBuffer] = useState(false);
  // Ref to block all mic recording after force_mic_off (hard 35-min stop)
  const isMicForceOffRef = useRef(false);

  // Timed mode — per-question 2-min timer
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState<number | null>(null);
  const [questionTimerExpired, setQuestionTimerExpired] = useState(false);
  const questionTimerExpiredRef = useRef(false); // sync ref — avoids stale closure in setTimeout/setInterval callbacks

  // ── Repeat-Question button gating + timer-freeze during the re-speak ──
  // canRepeat: the Repeat button is only clickable during the FIRST VAD window
  // (silence_duration_ms, ~8s) of the candidate's turn — after that it disables.
  const [canRepeat, setCanRepeat] = useState(false);
  const repeatWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // repeatFreeze: from a Repeat click until Bina finishes re-speaking, the
  // per-question answer timer is FROZEN (doesn't count down). We snapshot the
  // remaining seconds at click time and resume from it after the re-speak, so
  // the repeat's speech never eats the candidate's answer window.
  const repeatFreezeRef = useRef(false);
  const repeatFrozenRemainingRef = useRef<number | null>(null);
  // True once the candidate has used their one repeat for the CURRENT question.
  // Reset only when a genuinely NEW question starts. Prevents the repeat window
  // from re-arming after the repeat's own re-speak resume.
  const repeatUsedThisTurnRef = useRef(false);
  // Id of the "Let's move on…" skip chip so it can be removed if the candidate
  // actually spoke and a real transcript lands for the skipped question.
  const skipChipIdRef = useRef<string | null>(null);

  // Bridge phrase caption — shown while Bina speaks a pre-cached transition
  // clip after the 2-min hard-cap fires. Distinct from the question card
  // (rendered as a "Bina · Transition" chip below the avatar) so reviewers
  // and candidates don't mistake it for an interview question.
  const [bridgeCaption, setBridgeCaption] = useState<string | null>(null);
  // Bumped whenever questionTimerPendingRef is set to a new duration. The
  // pending-timer useEffect uses this as a dependency so it re-fires even
  // when isAiSpeaking doesn't transition (covers the race where
  // question_timer_started arrives just AFTER audio_end flipped isAiSpeaking
  // to false — previously the effect saw nothing changed and the pending
  // value just sat there, producing the "no timer on Q3" bug).
  const [questionTimerPendingTick, setQuestionTimerPendingTick] = useState(0);
  // Set when the server blocks this connection because the interview link is
  // already open/active in another window or device (single-active-session
  // guard). Shows a terminal overlay and stops auto-reconnect.
  const [concurrentBlocked, setConcurrentBlocked] = useState(false);
  const concurrentBlockedRef = useRef(false);
  // Next-Q debounce: set true the moment the candidate clicks Next Q (so the
  // button disables immediately and rapid double-clicks can't send multiple
  // skip_question messages). Cleared when the backend sends the next question's
  // question_timer_started event, confirming the skip was processed.
  const [nextSkipInFlight, setNextSkipInFlight] = useState(false);
  const nextSkipInFlightRef = useRef(false);
  // Guards the "Repeat Question" action button so a double-click can't fire two
  // repeat_question messages. Released when the backend re-opens the answer
  // window (question_timer_started) — same lifecycle as nextSkipInFlight.
  const [repeatInFlight, setRepeatInFlight] = useState(false);
  const repeatInFlightRef = useRef(false);
  // Tracks whether the BACKEND already sent question_timer_expired for the current
  // question. When true, the client must NOT send its own skip_question — the
  // backend's _auto_skip already called handle_skip_question. Cleared when the
  // next question_timer_started arrives.
  const backendExpiredRef = useRef(false);
  const questionTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Wall-clock of the last successful timer tick. The stuck-detection
  // watchdog compares this against now() — if more than 3 s has passed
  // while the timer should be running, the interval is presumed dead and
  // restarted from the cached remaining value. Catches the case where an
  // `interrupted` event kills the interval but no `question_timer_started`
  // arrives to restart it (user sees "frozen at 0:39" / "frozen at 1:00").
  const questionTimerLastTickMsRef = useRef<number>(0);
  // Ref that mirrors questionTimerSeconds state — readable synchronously in callbacks.
  // Required for stopRecording to deduct remaining seconds from the global timer.
  const questionTimerSecondsRef = useRef<number | null>(null);
  // Initial duration of the current question timer — used as the progress bar reference.
  const questionTimerTotalRef = useRef<number>(120);
  // Fix 1 (Server-timestamp-driven timer): anchor the per-question countdown to
  // a monotonic `performance.now()` taken the instant the timer actually starts
  // ticking on the client (AFTER Bina finishes and during candidate's turn).
  // All subsequent ticks compute remaining = duration − elapsed, instead of
  // the legacy `prev - 1` decrement. This eliminates accumulated drift when
  // the tab is backgrounded / throttled, and makes the displayed timer match
  // the backend's monotonic question timer to the nearest second.
  const questionTimerStartedAtMsRef = useRef<number | null>(null);
  // Time spent paused (while Bina speaks) — subtracted from wall-clock elapsed.
  const questionTimerPausedMsRef = useRef<number>(0);
  const questionTimerPausedAtRef = useRef<number | null>(null);
  // Fix 2: track the seconds Bina used out of the 120s slot so we can render
  // "Bina spoke 23s — you have 97s" under the timer. The candidate is
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
  // Pending: timer duration received but interval not started yet (waiting for Bina to stop)
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
  // Used to let the 2-min timer keep running during Bina's follow-up speech.
  // Main questions: timer pauses while Bina speaks (candidate gets full window).
  // Follow-ups: timer runs continuously (remaining time already accounts for Bina's speech).
  const isFollowUpRef = useRef(false);

  // When true, the per-question countdown is frozen at its initial duration
  // until the candidate actually starts speaking (detected via VAD or Web
  // Speech API). Flipped false inside the speech_started paths. This makes
  // the displayed timer reflect RESPONSE time, not wall-clock since question
  // was asked — candidates no longer lose seconds while thinking.
  const questionTimerAwaitingSpeechRef = useRef<boolean>(false);

  // Skill coverage (real-time, timed mode only)
  const [, setSkillCoverage] = useState<{
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
    clusters?: ClusterData[];
  } | null>(null);

  // AIU40: Section transition overlay
  const [sectionTransition, setSectionTransition] = useState<{ message: string; fromCluster: string; toCluster: string } | null>(null);

  // AIU51/AIU72: Repeat-request overlay
  const [showRepeatRequest, setShowRepeatRequest] = useState(false);

  // Figma UI state
  // Note (2026-05-28): `waveHeights` state previously fired setState every
  // 120 ms while Bina was speaking, but the value was never consumed in
  // any JSX. Dead state removed — saves ~8 full-tree re-renders/sec during
  // every AI turn. The 120 ms interval effect is gone too (see below).
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // Set true when the candidate clicks End WHILE they were mid-answer. We stop
  // recording first (→ end_turn → the answer is transcribed and shown as a chat
  // bubble), then send `end_interview` only AFTER that transcript commits — so
  // Bina's farewell never pre-empts processing the candidate's final answer.
  const pendingEndAfterTranscriptRef = useRef(false);
  const [isFullscreenExited, setIsFullscreenExited] = useState(false);
  // True while the interview window has lost OS focus but is still visible
  // and still fullscreen — e.g. the candidate clicked Chrome's "<site> is
  // sharing your screen" bar (Hide/Stop) or a similar browser-chrome overlay.
  // A real tab switch / minimize is caught separately by
  // CandidateAIInterviewPortal's document.hidden watcher, which terminates
  // the interview outright — this state is deliberately non-destructive: it
  // just blocks interaction and shows a warning until focus returns, so an
  // innocuous click on the sharing bar can no longer go completely unnoticed
  // (previously only a low-severity, non-blocking log entry).
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
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

  // Mobile QR-based environment verification — set on
  // "environment_verification_triggered", cleared on
  // "environment_verification_submitted" (or local expiry).
  const [envVerification, setEnvVerification] = useState<null | {
    qrCodeDataUri: string | null;
    verificationUrl: string | null;
    expiresAt: string | null;
    challengeColor: string | null;
    challengeId: string | null;
    // False until "environment_verification_opened" arrives — i.e. the
    // moment the candidate's phone actually opens the verify link. Keeps the
    // laptop's background dark/neutral until then instead of revealing the
    // challenge color the instant the QR itself appears.
    challengeRevealed: boolean;
    // 5 sequential colors (1 per second) for the phone's first 5s recording
    // phase — populated by "environment_verification_triggered", cycled
    // starting from recordingStartedAt (below), NOT from when the QR/link
    // was opened, so candidate-side delays can't desync the sequence from
    // what their phone is actually filming.
    challengeColors: string[] | null;
    // Set only once "environment_verification_recording_started" arrives —
    // the phone's confirmed t=0 for the RGB cycle.
    recordingStartedAt: string | null;
    // Extracted from verificationUrl (last path segment) — used ONLY to poll
    // GET /candidate/environment-verify/{token}/status as a fallback when a
    // WS push (opened/recording_started/submitted) is missed, e.g. because
    // the candidate's phone request landed on a different backend worker
    // than the one holding this laptop's socket.
    verificationToken: string | null;
  }>(null);
  // Mirrors envVerification for use inside the WS onopen/onmessage closures,
  // which are created once by connect() and reused across reconnects — a
  // stale closure over the state variable itself would never see updates.
  const envVerificationRef = useRef<typeof envVerification>(null);
  useEffect(() => { envVerificationRef.current = envVerification; }, [envVerification]);
  // Guards environment-verification resume (session_resume send + clearing
  // envVerification) so a WS "submitted" message and a poll tick that both
  // observe the same submission can't each fire session_resume/duplicate the
  // resume action.
  const envVerificationResumedRef = useRef(false);

  const resumeEnvVerification = useCallback(() => {
    if (envVerificationResumedRef.current) return;
    envVerificationResumedRef.current = true;
    setEnvVerification(null);
    try { wsRef.current?.send(JSON.stringify({ type: 'session_resume' })); } catch { /* best-effort */ }
  }, []);

  // Fallback reconciliation against the backend's authoritative status —
  // covers a WS push (opened/recording_started/submitted) that never
  // arrived, most commonly because the candidate's phone request landed on a
  // different backend worker than the one holding THIS laptop socket. Used
  // both by the polling interval below and once immediately after a WS
  // reconnect, since a reconnect gap is exactly when a push could be lost.
  const reconcileEnvVerificationFromStatus = useCallback(async () => {
    const token = envVerificationRef.current?.verificationToken;
    if (!token || envVerificationResumedRef.current) return;
    try {
      const data = await candidateAIInterviewService.getEnvironmentVerificationStatus(token);
      if (data.status === 'submitted' || data.status === 'completed') {
        resumeEnvVerification();
        return;
      }
      if (data.status === 'expired') {
        // Expired with no submission — resume ourselves rather than relying
        // solely on the overlay's own countdown (that countdown's effect
        // tears down the instant envVerification clears, so it can't be the
        // sole trigger once THIS path is the one clearing it). Guarded by
        // resumeEnvVerification so a near-simultaneous onExpired firing from
        // the overlay's own timer never double-sends session_resume.
        resumeEnvVerification();
        return;
      }
      setEnvVerification(prev => {
        if (!prev) return prev;
        if (prev.challengeRevealed && (prev.recordingStartedAt || !data.recording_started_at)) return prev;
        return {
          ...prev,
          challengeRevealed: prev.challengeRevealed || data.status === 'opened' || Boolean(data.recording_started_at),
          recordingStartedAt: prev.recordingStartedAt || data.recording_started_at,
        };
      });
    } catch {
      /* best-effort — next poll tick or a subsequent WS push will retry */
    }
  }, [resumeEnvVerification]);

  // Polling fallback (spec: "the frontend must NOT remain dependent on
  // WebSocket delivery"). Only runs while a verification is actually active,
  // and stops the instant it resolves (submitted/completed/expired) or the
  // candidate-facing countdown clears it.
  useEffect(() => {
    if (!envVerification?.verificationToken) return;
    const interval = setInterval(() => { void reconcileEnvVerificationFromStatus(); }, 2000);
    return () => clearInterval(interval);
  }, [envVerification?.verificationToken, reconcileEnvVerificationFromStatus]);

  // Ref mirror so ws.onopen (defined once inside connect(), reused across
  // reconnects — see "Stable callback refs" below) always calls the LATEST
  // reconciliation function instead of closing over a stale one.
  const reconcileEnvVerificationRef = useRef(reconcileEnvVerificationFromStatus);
  useEffect(() => { reconcileEnvVerificationRef.current = reconcileEnvVerificationFromStatus; }, [reconcileEnvVerificationFromStatus]);

  // Session ID — populated from `connected` WS event, used for violation event logging
  const sessionIdRef = useRef<string | null>(null);

  // WebSocket keepalive / reconnect refs
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Separate fast-retry counter for the "WS connected before /start flipped the
  // interview to in_progress" race (backend rejects 4003 "not in progress").
  // /start usually completes within 1-3s, so we retry quickly a few times
  // instead of giving up (which forced the candidate to manually refresh).
  const preStartRetryRef = useRef(0);
  const PRE_START_MAX_RETRIES = 15;
  const isUnmountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Timer modes:
  //   isFlexibleMode      = duration 0 (legacy unlimited) → count UP, pause while Bina speaks
  //   isNewFlexibleMode   = duration > 0, interview_mode='flexible' → count DOWN, runs NON-STOP
  //   timed / fixed       = duration > 0, interview_mode='fixed'  → count DOWN
  //                         Both timers pause while Bina speaks; run during candidate
  //                         recording, processing, and idle phases.
  // Flexible mode is now determined by special_instructions.interview_mode
  // (authoritative). duration_minutes holds the real budget (30 / 35 / N),
  // not a sentinel. Legacy records with duration_minutes=0 still fall back
  // to "flexible" via the helper.
  const resolvedMode = modeFromConfig(
    (interviewInfo as CandidateInterviewInfo & {
      special_instructions?: string | Record<string, unknown> | null;
    }).special_instructions,
    interviewInfo.duration_minutes,
  );
  const isFlexibleMode = resolvedMode === 'flexible' && isFlexibleDuration(interviewInfo.duration_minutes);
  const isNewFlexibleMode = resolvedMode === 'flexible' && !isFlexibleMode;
  const isBraveBrowser = typeof navigator !== 'undefined' && 'brave' in navigator;
  const [remainingSeconds, setRemainingSeconds] = useState(
    isFlexibleMode ? 30 * 60 : (interviewInfo.duration_minutes || 30) * 60
  );
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || isClosing) return;
    timerIntervalRef.current = setInterval(() => {
      // Global timer pauses — mirrors the per-question timer:
      //   - clarification: Bina re-explains → don't burn 30-min budget
      //   - Bina is speaking (non-silence-prompt): between-question TTS
      //     and the next main-question TTS should NOT eat the candidate's
      //     global budget either. The per-question timer isn't running
      //     during those windows (it was cleared at end_turn and only
      //     starts again after Bina finishes), so pausing global here
      //     keeps both clocks visually aligned.
      // Silence prompts ("Are you there?") are explicitly excluded — those
      // fire DURING the candidate's answer window and the global clock
      // must keep ticking so the 30-min budget is enforced.
      if (isClarificationRef.current) return;
      // Both global AND per-question timer only tick during the candidate's
      // turn (when they can actually speak). Pause during Bina's regular
      // speech. EXCEPTION: keep ticking during the silence nudge ("Are you
      // there?") — candidate is still "on the clock" even while Bina prompts
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
  }, [remainingSeconds, questionTimerSeconds, questionTimerExpired, questionNumber, totalQuestions, onTimerChange]);
  useEffect(() => { questionNumberRef.current = questionNumber; }, [questionNumber]);
  useEffect(() => { currentTranscriptRef.current = currentTranscript; }, [currentTranscript]);
  // Keep isClarificationRef in sync with state — used as a gate in timer intervals
  useEffect(() => { isClarificationRef.current = isClarification; }, [isClarification]);

  // ── Pre-turn "get ready" countdown (Change 1) ────────────────────────────
  // After Bina finishes speaking, before the mic opens, we show a big 5→1
  // countdown under the question ("Get ready… 5,4,3,2,1 → Now it's your turn").
  // The mic and the per-question answer timer stay OFF until it reaches 0.
  const [preTurnCountdown, setPreTurnCountdown] = useState<number | null>(null);
  const preTurnCountdownRef = useRef<number | null>(null);
  const preTurnCountdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const PRE_TURN_COUNTDOWN_FROM = 3; // seconds (per user story: "3..2..1…You may speak now")
  // Assigned in a useEffect (like startRecordingInternalRef) so finalizePlayback
  // and message handlers always call the freshest closure.
  const runPreTurnCountdownRef = useRef<(onComplete: () => void) => void>(() => {});
  const cancelPreTurnCountdownRef = useRef<() => void>(() => {});
  // Armed by every `question_timer_started` (a real question / follow-up /
  // clarification / repeat turn) and CONSUMED when the pre-turn countdown runs.
  // Silence-ladder nudges ("Are you there?" / move-on) do NOT send
  // question_timer_started, so this stays false for them and the mic reopens
  // immediately with no get-ready countdown after a nudge.
  const getReadyArmedRef = useRef(false);
  // ── AII14-PARKED: mid-speech silence COUNTDOWN (the old auto-advance) ─────
  // DISABLED, NOT DELETED. Previously: after ~5s of silence a 10→1 countdown
  // appeared and, when it ran out, the turn ended and the interview moved on by
  // itself. AII14 AC3 forbids that ("shall not automatically move to the next
  // question based only on silence detection") — a confirmation popup with a
  // Submit button replaces it (see midSilenceConfirm below).
  //
  // The state below is intentionally LEFT LIVE: the shared countdown overlay and
  // `bannerVisible` still reference it, and AC1's pre-turn 3..2..1 shares that
  // overlay. It is simply never set to a non-null value any more, so the
  // mid-silence branch never renders. Full original code (driver + overlay
  // branch + VAD auto end-turn) is preserved verbatim in
  // ./parked/silence-auto-advance.parked.md
  //
  // const SILENCE_COUNTDOWN_WINDOW_MS = 10000; // final 10s of the 15s window (5s silent, then 10→1)
  const [midSilenceCountdown, setMidSilenceCountdown] = useState<number | null>(null);
  const midSilenceCountdownRef = useRef<number | null>(null);
  const setMidSilenceCountdown_ = useCallback((val: number | null) => {
    if (midSilenceCountdownRef.current !== val) {
      midSilenceCountdownRef.current = val;
      setMidSilenceCountdown(val);
    }
  }, []);

  // ── AII14: "Are you done with your response?" confirmation ────────────────
  // Shown after DONE_CONFIRM_SILENCE_MS of CONTINUOUS silence following the
  // candidate's speech. It does NOT end the turn — the mic stays open and
  // recording continues. The candidate either speaks again (popup closes, the
  // 15s window restarts) or clicks Submit to finalize and move on.
  const DONE_CONFIRM_SILENCE_MS = 15000; // AC2: 15 seconds
  const [midSilenceConfirm, setMidSilenceConfirm] = useState(false);
  const midSilenceConfirmRef = useRef(false);
  const setMidSilenceConfirm_ = useCallback((val: boolean) => {
    if (midSilenceConfirmRef.current !== val) {
      midSilenceConfirmRef.current = val;
      setMidSilenceConfirm(val);
    }
  }, []);

  // "Now Speak" banner — shown when mic opens for candidate after Bina stops
  const [showNowSpeakBanner, setShowNowSpeakBanner] = useState(false);
  const nowSpeakShownForSessionRef = useRef(false); // prevents re-show within same recording session
  // Sync gates for the "Your turn — speak now" popup. The banner shows only once
  // BOTH the local capture pipeline (mic + worklet) is live AND — on the Web
  // Speech (batch) path — the browser recognizer is actually capturing audio
  // (onaudiostart). This keeps the popup, the listening bubble and the live
  // transcript appearing together instead of the popup leading by 2-5s.
  const turnPipelineReadyRef = useRef(false);    // mic + worklet connected this turn
  const webSpeechListeningRef = useRef(false);   // recognizer onaudiostart fired this turn
  const nowSpeakBannerFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── DEV DEBUG OVERLAY (remove before production release) ──────────────
  // Gate the whole overlay + its /debug/system-stats polling behind an OPT-IN
  // so candidates never see it and never trigger the 404 (the endpoint only
  // exists when the backend runs with DEBUG=True). OPT-IN ONLY via ?debug=1
  // (persisted) / ?debug=0 (cleared). We deliberately do NOT auto-enable on
  // non-production builds: STAGING is a non-production build too, so the old
  // `NODE_ENV !== 'production'` default leaked the overlay + a /debug/system-stats
  // 404 to real candidates on staging. Developers who want it just add ?debug=1
  // once (it persists in localStorage).
  const [devMonitorEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      const flag = params.get('debug');
      if (flag === '1') { window.localStorage.setItem('tf_dev_monitor', '1'); return true; }
      if (flag === '0') { window.localStorage.removeItem('tf_dev_monitor'); return false; }
      if (window.localStorage.getItem('tf_dev_monitor') === '1') return true;
    } catch { /* localStorage blocked — fall through */ }
    return false;
  });
  const [debugOpen, setDebugOpen] = useState(true);
  const [debugPos, setDebugPos] = useState({ x: 12, y: 12 });
  const [debugStats, setDebugStats] = useState({
    heapUsed: 0, heapTotal: 0, heapLimit: 0,
    wsState: 'N/A',
    avgLevel: 0, silenceThresh: 0, ambient: 0, voiceRatio: 1,
    silenceSince: null as number | null,
    silenceDurationMs: 5000,
    speechDetected: false,
    inTurnFrames: 0,
    audioCtxState: 'N/A',
    chunksPerSec: 0,
    sysRamUsed: -1, sysRamTotal: -1, sysRamPct: -1,
    sysCpu: -1,
    procRss: -1,
  });
  const _dbgChunkCountRef = useRef(0);
  const _dbgLastChunkSecRef = useRef(Date.now());
  const _dbgAvgLevelRef = useRef(0);
  // Voice-band spectral ratio (0..1) of the current frame — fraction of mic
  // spectral energy inside the human-voice band. High for speech, low for
  // broadband noise / low hum / music. Surfaced in the dev overlay + key logs
  // so the VOICE_BAND_MIN_RATIO threshold can be calibrated from real audio.
  const _dbgVoiceRatioRef = useRef(1);
  const freqBufRef = useRef<Uint8Array | null>(null);
  // drag state — all in refs so dragging never triggers re-render
  const _dbgDragRef = useRef({ dragging: false, ox: 0, oy: 0 });

  // Poll browser stats every 500ms
  useEffect(() => {
    const id = setInterval(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const now = Date.now();
      const elapsed = (now - _dbgLastChunkSecRef.current) / 1000;
      const cps = elapsed > 0 ? Math.round(_dbgChunkCountRef.current / elapsed) : 0;
      _dbgChunkCountRef.current = 0;
      _dbgLastChunkSecRef.current = now;
      setDebugStats(prev => ({
        ...prev,
        heapUsed: mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1,
        heapTotal: mem ? Math.round(mem.totalJSHeapSize / 1048576) : -1,
        heapLimit: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : -1,
        wsState: wsRef.current
          ? (['CONNECTING','OPEN','CLOSING','CLOSED'][wsRef.current.readyState] ?? 'UNKNOWN')
          : 'NO WS',
        avgLevel: _dbgAvgLevelRef.current,
        silenceThresh: silenceThresholdRef.current,
        ambient: ambientNoiseFloorRef.current,
        voiceRatio: _dbgVoiceRatioRef.current,
        silenceSince: silenceStartRef.current,
        silenceDurationMs: silenceDurationMsRef.current,
        speechDetected: speechDetectedRef.current,
        inTurnFrames: inTurnSpeechFrameCountRef.current,
        audioCtxState: (audioContextRef as React.MutableRefObject<AudioContext | null>)?.current?.state ?? 'N/A',
        chunksPerSec: cps,
      }));
    }, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll server system stats every 2s — only when the dev monitor is enabled,
  // so candidate sessions never hit the (DEBUG-gated) endpoint or log a 404.
  useEffect(() => {
    if (!devMonitorEnabled) return;
    let sysStatsAvailable = true;
    const fetchSys = async () => {
      if (!sysStatsAvailable) return;
      try {
        const r = await fetch('/api/v1/debug/system-stats');
        if (r.status === 404) { sysStatsAvailable = false; return; }
        if (!r.ok) return;
        const d = await r.json();
        setDebugStats(prev => ({
          ...prev,
          sysRamUsed: d.ram_used_mb ?? -1,
          sysRamTotal: d.ram_total_mb ?? -1,
          sysRamPct: d.ram_percent ?? -1,
          sysCpu: d.cpu_percent ?? -1,
          procRss: d.process_rss_mb ?? -1,
        }));
      } catch { /* silent */ }
    };
    fetchSys();
    const id = setInterval(fetchSys, 2000);
    return () => clearInterval(id);
  }, [devMonitorEnabled]);

  // Drag handlers — attached to document while dragging
  const _dbgOnPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    _dbgDragRef.current = { dragging: true, ox: e.clientX - debugPos.x, oy: e.clientY - debugPos.y };
  };
  const _dbgOnPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!_dbgDragRef.current.dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 20, e.clientX - _dbgDragRef.current.ox));
    const y = Math.max(0, Math.min(window.innerHeight - 20, e.clientY - _dbgDragRef.current.oy));
    setDebugPos({ x, y });
  };
  const _dbgOnPointerUp = () => { _dbgDragRef.current.dragging = false; };
  // ── END DEV DEBUG OVERLAY ─────────────────────────────────────────────

  // Bug C fix: flips true ONLY inside TalkingHead's onAudioEnd callback — the
  // canonical "audio actually finished playing" signal. Stays false while
  // `audio_end` has been received from backend but the client-side buffer is
  // still playing (most common on Q1 when AudioContext is cold). Flips back
  // to false on `speaking_started` so the next turn starts clean. The "Your
  // turn" banner gates on this instead of just `!isAiSpeaking`, because
  // setIsAiSpeaking(false) in the audio_end path can race ahead of the
  // actual audible end of Bina's speech.
  const candidatePlaybackEndedRef = useRef(false);
  const [candidatePlaybackEnded, setCandidatePlaybackEnded] = useState(false);

  // Waveform animation interval removed (2026-05-28). The state was never
  // rendered anywhere; the interval was forcing ~8 full-tree React re-renders
  // per second during every AI turn. If a future visual waveform is needed,
  // implement it inside an isolated React.memo component with its own local
  // state so parent reconciliation isn't triggered on each amplitude tick.

  // "Now Speak" banner — visible for the ENTIRE candidate-turn window.
  //
  // It is shown in sync with REAL listening: once the capture pipeline is live
  // AND (on the Web Speech path) the recognizer is actually capturing audio
  // (onaudiostart) — see markListeningStarted(). So the popup and the right-side
  // listening bubble appear together. This effect resets the per-turn sync gates
  // when the turn ends.
  useEffect(() => {
    if (!isRecording) {
      // Reset for next recording session
      nowSpeakShownForSessionRef.current = false;
      turnPipelineReadyRef.current = false;
      webSpeechListeningRef.current = false;
      if (nowSpeakBannerFallbackTimerRef.current) {
        clearTimeout(nowSpeakBannerFallbackTimerRef.current);
        nowSpeakBannerFallbackTimerRef.current = null;
      }
      setShowNowSpeakBanner(false);
    }
  }, [isRecording]);

  // Bulletproof hide: whenever Bina starts speaking (any path — greeting,
  // follow-up, clarification, interstitial), tear down the banner AND the
  // pending show-timer. This is the last line of defence against the
  // "Your turn — speak now" popup appearing while Bina is mid-sentence.
  useEffect(() => {
    if (isAiSpeaking) {
      setShowNowSpeakBanner(false);
    }
  }, [isAiSpeaking]);

  // Use module-level helper so this isn't re-created each parent render.
  // (Phase 1 perf — see formatTimeMMSS declaration near the top of file.)
  const formatTime = formatTimeMMSS;

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
  const abortRecordingForSkipRef = useRef<() => void>(() => {});

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

  // Fix #1 (avatar-decoupled playback_complete): a DEDICATED wall-clock timer
  // whose ONLY job is to deliver `playback_complete` to the backend, derived
  // purely from the known audio duration. Independent of the 3D avatar
  // (TalkingHead), the playback-tracker AudioContext, and the mic/UI state
  // guards on the bundled safety-net. The backend gates its per-question
  // silence clock on playback_complete; when the avatar fails to initialise or
  // the AudioContext stays suspended, the tracker/onended path never fires and
  // the guarded safety-net can be skipped — so the backend burns its full 30s
  // timeout PER QUESTION ("playback_complete timeout — proceeding anyway",
  // making the whole interview feel frozen). This timer guarantees the signal
  // arrives on time regardless. Sending it is idempotent on the backend, so
  // overlapping with the tracker/safety-net paths is harmless.
  const playbackCompleteSignalRef = useRef<NodeJS.Timeout | null>(null);

  // Webcam ref for hand detection
  const webcamRef = useRef<WebcamRef>(null);
  const [webcamReady, setWebcamReady] = useState(false);

  // Avatar ready state — WebSocket connects only after avatar is loaded
  const [avatarReady, setAvatarReady] = useState(false);
  // Fix #2: true when the 3D avatar (TalkingHead) fails to initialise OR is
  // taking too long to load. When set, we render a static Bina image over the
  // (blank) 3D canvas so the candidate sees a proper face. Audio still plays via
  // TalkingHead's internal Web Audio fallback, and playback_complete is
  // delivered by the avatar-decoupled timer from fix #1 — so the interview runs
  // at full speed with only the visual downgraded.
  // NOTE (2026-05-26): the earlier proactive lite-mode trip based on
  // hardwareConcurrency was REVERTED — per product spec the 3D avatar must
  // load for ALL systems. The fallback now triggers ONLY on a real failure
  // path (the existing onFallback + watchdog at :~4512). For single-core
  // perf the real fix is GLB compression (Meshopt/Draco + KTX2 textures),
  // not preemptively skipping the 3D render.
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Video recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  // Keeps the recording-audio boost graph alive (a GC'd AudioContext would stop
  // the boost). Used to make quiet headset mics clearly audible in the saved video.
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  // Close the boost AudioContext on unmount so it doesn't leak across sessions.
  useEffect(() => () => {
    try { recordingAudioCtxRef.current?.close(); } catch { /* already closed */ }
    recordingAudioCtxRef.current = null;
  }, []);
  // Live handles into the recording graph built once in handleVideoReady, kept
  // reachable so a later device reacquire (mic unplug/replug) can swap in the
  // NEW tracks instead of leaving mediaRecorderRef silently recording from
  // tracks Webcam.tsx is about to .stop(). See handleTracksReplaced below.
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingBoostRef = useRef<GainNode | null>(null);
  const recordingMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // Checkpoint upload refs — periodic flushes protect against tab-throttle/abrupt close
  const checkpointTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkpointInProgressRef = useRef(false);
  const isFinalizingUploadRef = useRef(false);
  const uploadCheckpointRef = useRef<() => Promise<void>>(async () => {});
  const uploadRecordingRef = useRef<() => Promise<void>>(async () => {});
  // SINGLE-FLIGHT guard for the FINAL recording flush. The final upload is
  // triggered from several places that can all fire for one interview close —
  // the ws.onclose handlers and the unmount cleanup. Each used to POST its own
  // final segment; landing on two uvicorn workers at once, they interleaved
  // upload_part/complete on the same multipart upload and the loser died with
  // `InvalidPart` → 502 → recording lost. Holding the in-flight promise here
  // means every later caller AWAITS the first upload instead of starting a
  // second one. This is the client half of that fix; the server half is the
  // per-key lock + idempotent completion in recording_mpu_service.py.
  const finalUploadPromiseRef = useRef<Promise<void> | null>(null);
  // S3 multipart-upload segment index (0-based → backend part_number = idx + 1).
  // recordedChunksRef now holds only the UNFLUSHED clusters since the last
  // segment; we flush a segment once the buffer reaches RECORDING_MIN_SEGMENT_BYTES.
  const recordingSegmentIndexRef = useRef(0);

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
    webcamStreamRef.current = stream;
    const sharedAudioTrack = stream.getAudioTracks().find(track => track.readyState === 'live');
    if (sharedAudioTrack?.label) {
      setActiveMicLabel(sharedAudioTrack.label);
    }
    setWebcamStream(stream);
  }, []);
  const reportProctorEvent = useCallback(async (t: string, event: ProctorEventPayload) => {
    return candidateAIInterviewService.reportProctorEvent(t, event);
  }, []);

  const { state: proctoringState, emitEvent, flushEvents } = useInterviewProctoringMonitor({
    token,
    stream: webcamStream,
    enabled: isConnected,
    copyPasteBlocking,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
    reportEvent: reportProctorEvent,
    // Suppress voice_detected while Bina is speaking (TTS echo), while we are
    // actively recording the candidate's answer, OR during the between-question
    // "Hold On — get ready" transition (isProcessing). All three are expected /
    // transient states where ambient room noise must NOT raise a false "Voice
    // Activity Detected" toast. (This check is UI-only; the server speaker-ID
    // layer is the authoritative "another voice" signal.)
    shouldSuppressVoiceCheck: () =>
      isAiSpeakingRef.current || isRecordingRef.current
      || isProcessingRef.current || isCandidateTranscriptProcessingRef.current,
  });
  // Stable ref so ws.onclose closure can always call the latest flush function
  const flushProctoringEventsRef = useRef(flushEvents);
  useEffect(() => { flushProctoringEventsRef.current = flushEvents; }, [flushEvents]);

  // ── Device recovery (2026-06-05) ───────────────────────────────────────────
  // <Webcam> acquires getUserMedia ONCE on mount and never re-acquires, so after
  // the candidate unplugs / denies and then re-plugs / re-grants a device, the
  // proctoring monitor keeps watching the DEAD stream → the blocking "… Disabled"
  // overlay stays forever and they're stuck (interview runs behind it). When the
  // monitor reports a device disabled, poll Webcam.reacquire() until a fresh LIVE
  // stream returns; that re-feeds the monitor (onStream → setWebcamStream) so it
  // sees live tracks and clears the overlay + refreshes the preview. The answer
  // mic is opened separately per turn, so this recovery path is now scoped to the
  // webcam/proctoring stream only. getUserMedia here needs BOTH cam+mic, so
  // recovery only succeeds once the full candidate media path is back — exactly
  // the condition for resuming.
  useEffect(() => {
    if (!isConnected) return;
    const disabled = !proctoringState.isCameraActive || !proctoringState.isMicrophoneActive;
    if (!disabled) return;
    // Mic-only failure (camera still fine) uses the audio-only reacquire path
    // — it never requests or touches the video track, so a headset dropping
    // can't disturb an otherwise-healthy camera (see reacquireAudio's own
    // comment in Webcam.tsx for why the combined reacquire() could).
    // Anything involving the camera keeps using the combined reacquire().
    const micOnly = !proctoringState.isMicrophoneActive && proctoringState.isCameraActive;
    let cancelled = false;
    const id = setInterval(async () => {
      if (cancelled) return;
      let ok = false;
      try {
        ok = (micOnly
          ? await webcamRef.current?.reacquireAudio()
          : await webcamRef.current?.reacquire()) ?? false;
      } catch {
        /* device still unavailable — keep polling */
      }
      if (ok) {
        cancelled = true;
        clearInterval(id);
        console.log('[InterviewUI] Device recovery: re-acquired media stream — overlay will clear');
      }
    }, 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, [isConnected, proctoringState.isCameraActive, proctoringState.isMicrophoneActive]);

  // ── Camera/mic disconnect: pause + 3-minute grace, then terminate ──────────
  // ANY device loss — camera, mic (headset included, via
  // InterviewProctoringMonitor's deviceId-swap poll for the "OS silently
  // fell back to the built-in mic" case), or both together — pauses the
  // backend's question timer and gives the candidate 3 minutes to reconnect
  // before the interview is terminated. Camera and mic get IDENTICAL
  // handling here; which one is actually down only changes the overlay's
  // wording/icon (computed straight from proctoringState at render time,
  // not tracked separately) and which specific proctor event(s) get logged.
  //
  // Recovery needs no extra polling of its own: the existing device-recovery
  // effect above already drives reacquire()/reacquireAudio() attempts (mic-
  // only uses the audio-only path so it never disturbs a healthy camera —
  // see Webcam.tsx), and InterviewProctoringMonitor's own health-check flips
  // isCameraActive/isMicrophoneActive back to true automatically once the
  // device is live again — this effect just reacts to that transition.
  const MEDIA_PAUSE_GRACE_MS = 180000; // 3 minutes
  const [isMediaPaused, setIsMediaPaused] = useState(false);
  // True while the interview is paused because a screen recording was detected
  // (BUG09). Drives the blocking overlay; the pause itself is sent to the
  // backend by the effect below.
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [mediaPauseSecondsRemaining, setMediaPauseSecondsRemaining] = useState<number | null>(null);
  const isMediaPausedRef = useRef(false);
  const mediaPauseStartMsRef = useRef<number | null>(null);
  const mediaPauseCountdownIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaPauseTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors proctoringState so the setTimeout fired at ARM time can read
  // whatever is ACTUALLY down 3 minutes later (not what was down when the
  // timer started) when building the termination reason.
  const proctoringStateRef = useRef(proctoringState);
  useEffect(() => { proctoringStateRef.current = proctoringState; }, [proctoringState]);

  const clearMediaPauseTimers = useCallback(() => {
    if (mediaPauseCountdownIdRef.current) { clearInterval(mediaPauseCountdownIdRef.current); mediaPauseCountdownIdRef.current = null; }
    if (mediaPauseTimeoutIdRef.current) { clearTimeout(mediaPauseTimeoutIdRef.current); mediaPauseTimeoutIdRef.current = null; }
  }, []);

  // 'camera_disconnected' | 'microphone_disconnected' | 'camera_and_microphone_disconnected'
  const mediaDownReason = useCallback((camOk: boolean, micOk: boolean): string => {
    if (!camOk && !micOk) return 'camera_and_microphone_disconnected';
    return !camOk ? 'camera_disconnected' : 'microphone_disconnected';
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    const anyDown = !proctoringState.isCameraActive || !proctoringState.isMicrophoneActive;

    if (anyDown && !isMediaPausedRef.current) {
      // ARM: a device just went down — start the pause+grace window.
      if (isClosingRef.current) return; // interview already wrapping up — don't arm
      isMediaPausedRef.current = true;
      setIsMediaPaused(true);
      mediaPauseStartMsRef.current = Date.now();
      setMediaPauseSecondsRemaining(Math.ceil(MEDIA_PAUSE_GRACE_MS / 1000));

      const reason = mediaDownReason(proctoringState.isCameraActive, proctoringState.isMicrophoneActive);
      try { wsRef.current?.send(JSON.stringify({ type: 'session_pause', reason })); } catch { /* best-effort */ }
      if (!proctoringState.isCameraActive) {
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'camera_disabled',
          severity: 'severe',
          details: { phase: 'in_interview', grace_period_ms: MEDIA_PAUSE_GRACE_MS },
        }).catch(() => { /* best-effort */ });
      }
      if (!proctoringState.isMicrophoneActive) {
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'microphone_disabled',
          severity: 'severe',
          details: { phase: 'in_interview', reason: 'headset_disconnected', grace_period_ms: MEDIA_PAUSE_GRACE_MS },
        }).catch(() => { /* best-effort */ });
      }

      clearMediaPauseTimers();
      mediaPauseCountdownIdRef.current = setInterval(() => {
        const startedAt = mediaPauseStartMsRef.current;
        if (startedAt === null) return;
        const left = Math.max(0, Math.ceil((MEDIA_PAUSE_GRACE_MS - (Date.now() - startedAt)) / 1000));
        setMediaPauseSecondsRemaining(left);
      }, 200);
      mediaPauseTimeoutIdRef.current = setTimeout(() => {
        clearMediaPauseTimers();
        // Still down after the full grace window — terminate, mirroring the
        // "left the interview screen" termination path in the parent portal.
        // Reads CURRENT state (not the state at arm time) since the set of
        // down devices may have changed during the 3 minutes.
        const cur = proctoringStateRef.current;
        onTerminate?.(`${mediaDownReason(cur.isCameraActive, cur.isMicrophoneActive)}_timeout`);
      }, MEDIA_PAUSE_GRACE_MS);
    } else if (!anyDown && isMediaPausedRef.current) {
      // RECOVERED within the window (both camera and mic — the ORIGINAL mic
      // device by deviceId — are live again) — tear down the pause and
      // resume the backend's question timer.
      clearMediaPauseTimers();
      const startedAt = mediaPauseStartMsRef.current;
      const pauseDurationMs = startedAt !== null ? Math.max(0, Date.now() - startedAt) : null;
      mediaPauseStartMsRef.current = null;
      isMediaPausedRef.current = false;
      setIsMediaPaused(false);
      setMediaPauseSecondsRemaining(null);

      try { wsRef.current?.send(JSON.stringify({ type: 'session_resume' })); } catch { /* best-effort */ }
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'session_resumed',
        severity: 'low',
        details: {
          reason: 'media_reconnected',
          pause_duration_ms: pauseDurationMs,
          pause_duration_seconds: pauseDurationMs !== null ? Math.round(pauseDurationMs / 1000) : null,
        },
      }).catch(() => { /* best-effort */ });
    }
  }, [isConnected, proctoringState.isMicrophoneActive, proctoringState.isCameraActive, token, onTerminate, clearMediaPauseTimers, mediaDownReason]);

  // ── Screen-recording pause (BUG09) ────────────────────────────────────────
  // Driven by the parent portal's detection, which stays active for the whole
  // interview. Same shape as the media-disconnect pause above — session_pause on
  // arm, session_resume on recovery — with two deliberate differences: there is
  // NO grace countdown and NO termination (the candidate can take as long as
  // they need to stop their recorder), and the overlay blocks interaction
  // because the interview genuinely must not proceed while recording.
  //
  // Nothing is lost across the pause: the backend freezes the question timer,
  // shifts it forward by the pause duration on resume, cancels Bina's pipeline
  // and replays the exact question she was interrupted on. A transcript captured
  // mid-pause is stashed server-side and applied on resume.
  const isRecordingPausedRef = useRef(false);
  const recordingPauseStartMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isConnected) return;

    if (screenRecordingDetected && !isRecordingPausedRef.current) {
      if (isClosingRef.current) return; // already wrapping up — don't pause
      isRecordingPausedRef.current = true;
      recordingPauseStartMsRef.current = Date.now();
      setIsRecordingPaused(true);
      setStatus('Interview paused — screen recording detected.');
      try { wsRef.current?.send(JSON.stringify({ type: 'session_pause', reason: 'screen_recording' })); } catch { /* best-effort */ }
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'session_paused',
        severity: 'low',
        details: { reason: 'screen_recording_detected', phase: 'in_interview' },
      }).catch(() => { /* best-effort */ });
      console.log('[INTERVIEW-DEBUG] Interview paused — screen recording detected');
    } else if (!screenRecordingDetected && isRecordingPausedRef.current) {
      const startedAt = recordingPauseStartMsRef.current;
      const pauseDurationMs = startedAt !== null ? Math.max(0, Date.now() - startedAt) : null;
      isRecordingPausedRef.current = false;
      recordingPauseStartMsRef.current = null;
      setIsRecordingPaused(false);
      try { wsRef.current?.send(JSON.stringify({ type: 'session_resume' })); } catch { /* best-effort */ }
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'session_resumed',
        severity: 'low',
        details: {
          reason: 'screen_recording_stopped',
          pause_duration_ms: pauseDurationMs,
          pause_duration_seconds: pauseDurationMs !== null ? Math.round(pauseDurationMs / 1000) : null,
        },
      }).catch(() => { /* best-effort */ });
      console.log('[INTERVIEW-DEBUG] Interview resumed — screen recording stopped');
    }
  }, [isConnected, screenRecordingDetected, token]);

  // Belt-and-braces cleanup on unmount so a stray timer can never fire into
  // an unmounted tree (mirrors the pattern used for other proctoring timers).
  useEffect(() => () => clearMediaPauseTimers(), [clearMediaPauseTimers]);

  // Fullscreen — disabled (no popup/overlay)
  // Face detection & gaze tracking (Phase 2 & 3)
  // Violations log to backend only — they MUST NOT stop the mic, kill the
  // per-question timer, end the turn, or show a blocking overlay.
  // stopRecordingSilent had heavy side-effects (clears interval, deducts
  // global timer, sends end_turn) so calling it on every violation was
  // freezing the question slot mid-answer; the full-screen "Face Not
  // Detected" overlay made it worse by hiding the question + timer from
  // the candidate. Violation is still surfaced via the toast warning system
  // (InterviewProctoringWarnings) and logged to the recruiter timeline.
  const handleFaceMissing = useCallback(() => {
    emitEvent('face_missing', { timestamp: new Date().toISOString() });
  }, [emitEvent]);

  const handleFaceRestored = useCallback(() => {
    // No-op: we never blocked the interview, so nothing to restore.
  }, []);

  const handleMultipleFaces = useCallback((count: number) => {
    emitEvent('multiple_faces', { face_count: count });
  }, [emitEvent]);

  const handleGazeAway = useCallback((direction: string) => {
    emitEvent('gaze_away', { direction });
  }, [emitEvent]);

  // Prohibited object on camera (phone / second screen / book).
  // The whole payload is forwarded verbatim so `object_class` — the model's own
  // class string — lands in the stored violation. The recruiter's Integrity
  // Check tab reads it back to name the exact item; never a generic "object".
  const handleObjectDetected = useCallback(
    (eventType: ObjectEventType, det: DetectedObjectEvent) => {
      emitEvent(eventType, {
        object_class: det.object_class,
        object_label: det.object_label,
        confidence: Number(det.confidence.toFixed(3)),
        box: det.box.map(n => Number(n.toFixed(4))),
        consecutive_frames: det.consecutive_frames,
        detector: det.detector,
      });
    },
    [emitEvent],
  );

  // Detection is best-effort: it needs WebGPU (Safari/Firefox may not have it)
  // and the vendored model+runtime to be present on the server.
  //
  // Record the failure as a proctoring event, not just a console line. A
  // detector that never started produces an interview with zero phone flags,
  // which is indistinguishable from a genuinely clean one — so the recruiter
  // MUST be able to see that the check didn't run. Persisted as "info"
  // severity server-side, so it never counts against the candidate.
  const handleObjectDetectionUnavailable = useCallback((reason: string) => {
    console.warn('[INTERVIEW_OBJECT_DETECTION] Unavailable —', reason);
    emitEvent('object_detection_unavailable', { reason });
  }, [emitEvent]);

  const objectDetection = useInterviewObjectDetection({
    enabled: isConnected && webcamReady,
    lowTier: effectiveDeviceCapability?.tier === 'low',
    onObjectDetected: handleObjectDetected,
    onUnavailable: handleObjectDetectionUnavailable,
  });

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
    objectDetection.setVideoElement(video);
    setWebcamReady(true);

    // Start video recording from webcam stream.
    // Low bitrate: 200 Kbps video + 64 Kbps audio = ~264 Kbps total.
    // 30-min interview ≈ 59 MB — well within upload limits.
    const stream = video.srcObject as MediaStream;
    if (stream) {
      webcamStreamRef.current = stream;

      // ── Build the RECORDING audio mix: boosted candidate mic + Bina's clean
      // TTS tap. Mirrors the screen-recording mix in CandidateAIInterviewPortal
      // so both saved views have the same two-voice balance.
      //
      // Mic: boosted via gain → limiter because raw webcam audio is too quiet on
      // headphones/earbuds. The VIDEO track passes through untouched. Non-
      // destructive: the original audio track stays live for proctoring, and the
      // ASR/transcription path uses its own separately-boosted stream.
      //
      // Bina: taken from the DIRECT tap (__interviewRecordingDest), never from
      // mic bleed. The webcam mic runs echoCancellation ON (Webcam.tsx), so her
      // voice off the speakers is mostly cancelled — without this tap the saved
      // Candidate View is one-sided (candidate only, questions inaudible) with
      // hollow half-cancelled residue where she spoke. Trimmed to 0.75 so the
      // boosted candidate sits at a comparable level instead of under her.
      //
      // If Web Audio setup fails for any reason we record the raw stream unchanged.
      let recordStream: MediaStream = stream;
      try {
        const aTracks = stream.getAudioTracks();
        if (aTracks.length > 0) {
          const Ctx: typeof AudioContext =
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const actx = new Ctx();
          recordingAudioCtxRef.current = actx;
          if (actx.state === 'suspended') actx.resume().catch(() => {});
          const dest = actx.createMediaStreamDestination();

          const srcNode = actx.createMediaStreamSource(new MediaStream(aTracks));
          const boost = actx.createGain();
          boost.gain.value = 3.0; // lift quiet headset/earbud speech
          // Limiter prevents the 3× boost from clipping a loud built-in mic.
          const limiter = actx.createDynamicsCompressor();
          limiter.threshold.value = -3;
          limiter.knee.value = 0;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.003;
          limiter.release.value = 0.1;
          srcNode.connect(boost).connect(limiter).connect(dest);

          // Bina's voice — direct tap only. The dest is created by the portal
          // BEFORE TalkingHead mounts (that's when the avatar wires itself into
          // it), so only use an existing one; creating it this late would route
          // nothing. Absent in flows without a screen-recording mix — the
          // recording then stays mic-only, exactly as before.
          const lindaDest = (window as any).__interviewRecordingDest as MediaStreamAudioDestinationNode | null;
          let binaMixed = false;
          if (lindaDest && lindaDest.stream.getAudioTracks().length > 0) {
            const lindaGain = actx.createGain();
            lindaGain.gain.value = 0.75;
            actx.createMediaStreamSource(lindaDest.stream).connect(lindaGain).connect(dest);
            binaMixed = true;
          }

          recordStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
          // Keep the mix graph reachable so handleTracksReplaced can rewire a
          // fresh mic source into `boost` on reacquire, instead of the
          // recording silently going dead when the old track is stopped.
          recordingDestRef.current = dest;
          recordingBoostRef.current = boost;
          recordingMicSourceRef.current = srcNode;
          console.log(
            `[Recording] audio mix active (mic gain 3× + limiter${binaMixed ? ', Bina tap @0.75' : ', Bina tap unavailable — mic only'})`,
          );
        }
      } catch (e) {
        console.warn('[Recording] audio mix setup failed — recording raw audio:', e);
        recordStream = stream;
      }
      // Reachable by handleTracksReplaced regardless of which path above ran —
      // in the fallback case this IS `stream` itself (same object Webcam.tsx
      // will reacquire against), so swapping tracks on it in place is safe.
      recordStreamRef.current = recordStream;

      const RECORDER_OPTIONS: MediaRecorderOptions = {
        videoBitsPerSecond: 200_000,  // 200 Kbps — clear face video at talking-head scale
        audioBitsPerSecond: 64_000,   // 64 Kbps — clearer voice (was 32 Kbps)
      };
      const startRecorder = (opts: MediaRecorderOptions) => {
        // Device-recovery (camera/mic reacquire after a drop) calls this again
        // on the SAME component instance, with recordingSegmentIndexRef still
        // holding whatever segment was in flight. A prior segment that failed
        // upload sits queued in recordedChunksRef for the next checkpoint
        // retry — but the recorder restart runs first and used to blow that
        // buffer away with recordedChunksRef.current = [] before the retry
        // ever got a chance, permanently losing that footage. Ship it now,
        // best-effort, under the segment index it was already queued at,
        // before resetting.
        if (recordedChunksRef.current.length > 0) {
          const staleChunks = recordedChunksRef.current;
          const staleIndex = recordingSegmentIndexRef.current;
          const staleMime = (mediaRecorderRef.current?.mimeType || opts.mimeType || 'video/webm').split(';')[0];
          const staleBlob = new Blob(staleChunks, { type: staleMime });
          candidateAIInterviewService
            .uploadRecording(token, staleBlob, staleIndex, false)
            .then(() => { recordingSegmentIndexRef.current = staleIndex + 1; })
            .catch((err) => console.warn(`[Recording] Pre-restart flush of segment ${staleIndex} failed — footage lost: ${getErrorMessage(err)}`));
        }
        const recorder = new MediaRecorder(recordStream, opts);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.start(5000); // 5-second chunks — fewer objects, same result
        mediaRecorderRef.current = recorder;
        console.log(`[Recording] Started: mimeType=${recorder.mimeType}, videoBps=${opts.videoBitsPerSecond}, audioBps=${opts.audioBitsPerSecond}`);

        // Periodic checkpoint uploads every 30s — make sure SOMETHING reaches the
        // server even if the tab is later throttled (background) or closed before
        // the normal completion-time upload path runs. Backend writes to a
        // deterministic filename keyed on interview id so each checkpoint
        // overwrites in place.
        if (checkpointTimerRef.current) clearInterval(checkpointTimerRef.current);
        checkpointTimerRef.current = setInterval(() => {
          uploadCheckpointRef.current().catch(() => {});
        }, 30_000);
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
    // Start continuous face-identity verification. On weak (≤2-core) machines
    // the face-api/TF.js loop is CPU-heavy, so instead of DISABLING it on
    // low-tier (which meant identity swaps were never caught) we run it at a
    // SLOWER 30s cadence — 3× fewer inferences keeps the main thread healthy
    // while still catching a substituted candidate within ~30s. Full-tier keeps
    // the default 10s cadence.
    const lowTier = effectiveDeviceCapability?.tier === 'low';
    if (faceVerification?.hasBaseline()) {
      faceVerification.startVerification(video, lowTier ? 30000 : undefined);
      console.log(`[INTERVIEW-DEBUG] Continuous face verification started (${lowTier ? '30s low-tier' : '10s'} cadence)`);
    }
  }, [handDetection, faceDetection, objectDetection, faceVerification, effectiveDeviceCapability]);

  // Called by Webcam.tsx SYNCHRONOUSLY right after it acquires a fresh
  // getUserMedia stream on reacquire (device unplug/replug) — BEFORE it stops
  // the old stream's tracks. Without this, the still-running mediaRecorderRef
  // keeps its recordStream wired to tracks that are about to be permanently
  // .stop()-ed, silently killing the stored recording's video+audio for the
  // remainder of the interview while the live preview/transcript recover fine
  // (they're fed by different streams/paths).
  //
  // No-ops before the recorder exists (recordStreamRef is only set once
  // handleVideoReady's setup above has run) — nothing to swap onto yet.
  const handleTracksReplaced = useCallback((newStream: MediaStream) => {
    const rs = recordStreamRef.current;
    if (!rs) return;

    // Video always passes through recordStream directly (both the mixed-audio
    // path and the raw fallback wrap the raw video track unchanged) — swap it
    // there regardless of which audio path is active.
    const newVideoTrack = newStream.getVideoTracks()[0];
    if (newVideoTrack) {
      rs.getVideoTracks().forEach((t) => { if (t !== newVideoTrack) rs.removeTrack(t); });
      if (!rs.getVideoTracks().includes(newVideoTrack)) rs.addTrack(newVideoTrack);
    }

    const newAudioTrack = newStream.getAudioTracks()[0];
    if (!newAudioTrack) return;

    const dest = recordingDestRef.current;
    const boost = recordingBoostRef.current;
    if (dest && boost) {
      // Web-Audio mix path: recordStream's audio track comes from `dest`,
      // which doesn't die on its own — it just goes silent once its only
      // live input (the old, now-ending mic track) ends. Rewire a fresh
      // source into the existing boost→limiter→dest chain; no change needed
      // to recordStream's own track list.
      try { recordingMicSourceRef.current?.disconnect(); } catch { /* already dead */ }
      const actx = recordingAudioCtxRef.current;
      if (actx) {
        try {
          const freshSource = actx.createMediaStreamSource(new MediaStream([newAudioTrack]));
          freshSource.connect(boost);
          recordingMicSourceRef.current = freshSource;
          console.log('[Recording] Mic reconnected into recording graph after device reacquire');
        } catch (e) {
          console.warn('[Recording] Failed to rewire mic into recording graph on reacquire:', e);
        }
      }
    } else {
      // No Web Audio mix (setup failed at record-start) — recordStream carries
      // the raw audio track directly, so swap it there instead.
      rs.getAudioTracks().forEach((t) => { if (t !== newAudioTrack) rs.removeTrack(t); });
      if (!rs.getAudioTracks().includes(newAudioTrack)) rs.addTrack(newAudioTrack);
    }
  }, []);

  // TalkingHead avatar ref — visual lip-sync (audio played by Web Audio API separately)
  const talkingHeadRef   = useRef<TalkingHeadHandle>(null);
  // (thStreamActive removed — no longer sending audio to TalkingHead)

  const visemeRafRef     = useRef<number | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Device tracking — scoped to the ACTIVE recording session only. We clear the
  // pin at turn end so each new question reopens on the browser's current
  // default input instead of staying stuck on an old system/headset device.
  const pinnedAudioDeviceIdRef = useRef<string | undefined>(undefined);
  const audioDeviceChangeListenerRef = useRef<(() => void) | null>(null);
  // AnalyserNode tapped off the mic source for the live recording waveform UI.
  // Passive sink (source→analyser only, never →destination, so no echo).
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const candidateAudioStreamingRef = useRef(false);
  const candidateAudioFrameCountRef = useRef(0);
  const micLevelLastUpdateRef = useRef(0);
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
  // The REAL "Bina's audio has finished" signal. A dedicated, silent
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
  // spawning one per Bina turn. The tracker prefers to share the
  // pre-created, already-unlocked `__interviewAudioContext` (set by the
  // fullscreen-prompt user-gesture button in CandidateAIInterviewPortal)
  // so it starts in the 'running' state even on the very first question.
  const getPlaybackTracker = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    let ctx = playbackTrackerCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      try {
        // Prefer the pre-warmed context if TalkingHead hasn't claimed it yet.
        const preCreated = (window as InterviewWindow).__interviewAudioContext;
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
      // resume() can flip state to 'running' synchronously in some browsers;
      // re-read through AudioContextState to defeat TS's earlier narrowing.
      if ((ctx.state as AudioContextState) !== 'running') return;
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
      // Store the RAW scheduled start. The audible-delay shift is applied by the
      // reveal loop at READ time, not here: this runs BEFORE streamStart (see the
      // chunk handler), so the active audio path — and therefore the correct
      // delay — isn't known yet on the first chunk of a turn.
      if (firstChunkStartCtxSecRef.current === null) {
        firstChunkStartCtxSecRef.current = startAt;
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
  const recognitionRef = useRef<BrowserSpeechRecognitionLike | null>(null);
  // Preemptive-restart timer — fires at 55s to stop the session cleanly before
  // Chrome/Edge's 60s hard kill or Safari's 15-30s kill causes a forced gap.
  const webSpeechPreemptiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBrowserTranscriptTextRef = useRef("");
  const lastBrowserTranscriptUpdateAtRef = useRef<number | null>(null);
  const lastLiveTranscriptTextRef = useRef("");
  const lastLiveTranscriptUpdateAtRef = useRef<number | null>(null);
  const turnHasLiveTranscriptRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Scroll container for the chat — used to pin the view to the bottom
  // (WhatsApp-style) so the newest question/response is always visible.
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isAiSpeakingRef = useRef(false);
  // True while Bina is speaking the "Are you there?" silence prompt — timer must NOT pause during this.
  const isSilencePromptRef = useRef(false);
  // True while Bina is speaking the opening "About the role" warm-up message.
  // It's an uncounted preamble that must NOT open the mic when its audio ends —
  // the mic opens for the "tell me about yourself" question that immediately
  // follows. finalizePlayback checks this and skips the mic-open (then it's
  // cleared by the next speaking_started / greeting).
  const roleIntroActiveRef = useRef(false);
  // Role-message text kept ONLY for TalkingHead lip-sync. The role message is
  // committed as a static bubble (tokenBufferRef is cleared, so it doesn't
  // stream), but the speaking_started handler feeds tokenBufferRef to
  // TalkingHead for phoneme lip-sync — which for the role turn would be "" and
  // leave Bina's mouth static ("audio plays, Bina silent"). We stash the role
  // text here so speaking_started can feed it to TalkingHead without putting it
  // in the reveal buffer.
  const roleIntroTextRef = useRef("");
  const isProcessingRef = useRef(false);
  // Cancellable ref for the 800ms "start recording after Bina stops" setTimeout.
  // Cancelled by the Next Q handler to prevent stale recording after a skip.
  const startRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback to execute after speak_text TTS finishes (replaces browser speechSynthesis)
  const speakTextCallbackRef = useRef<(() => void) | null>(null);

  // Stable callback refs — prevent WebSocket reconnection on re-renders
  const queueAudioRef = useRef<(pcmData: ArrayBuffer) => void>(() => {});
  const handleMessageRef = useRef<(data: InterviewSocketMessage) => void>(() => {});
  // Deferred streamStart: stored here by speaking_started, called on first audio chunk.
  // Prevents TalkingHead from receiving streamStart with an empty buffer (causes early
  // onAudioEnd on Q1 when AudioContext is cold or TalkingHead is still initialising).
  const pendingStreamStartRef = useRef<(() => void) | null>(null);
  // Set true when TalkingHead's worklet fires onAudioEnd BEFORE backend audio_end —
  // i.e. its internal buffer drained during a streaming hiccup. New PCM chunks
  // arriving after this point would go to a stopped worklet and be silently lost
  // (the "Bina's voice cuts mid-sentence" bug). When set, the next chunk that
  // arrives must call streamStart() again to wake the worklet back up.
  const talkingHeadEndedEarlyRef = useRef(false);

  // Total PCM audio received for the current Bina turn (ms).
  // Used to set the audio_end fallback timeout so it always fires AFTER
  // TalkingHead finishes playing — not after a fixed 3s regardless of length.
  const currentTurnAudioMsRef = useRef(0);
  // Wall-clock timestamp (Date.now()) of when the FIRST PCM chunk for the
  // current Bina turn was received. Used by the token-reveal system to
  // compute audio progress (once audio_end fires).
  const firstPcmAtMsRef = useRef<number | null>(null);
  // Wall-clock timestamp of the LAST PCM chunk received for the current
  // Bina turn. Updated on every queueAudio call. This is the right anchor
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
  // (TALKING_HEAD_BUFFER_MS + getAudibleDelayMs() now live at module scope.)
  // Set to true to pipe reveal timing to the browser console — invaluable
  // for diagnosing text-before-voice reports from candidates.
  // Tracker-clock second (in AudioContext seconds) at which the FIRST PCM chunk
  // of this turn was scheduled — RAW, with no audible-delay shift applied.
  // The reveal loop adds getAudibleDelayMs() to derive the audible start, so the
  // shift always reflects the audio path actually in use this turn (which isn't
  // known yet at stamp time). This — NOT wall-clock, NOT chunk rates — is the
  // basis for "how far into Bina's voice are we".
  const firstChunkStartCtxSecRef = useRef<number | null>(null);

  // Token reveal system
  const tokenBufferRef = useRef("");
  const revealedCharsRef = useRef(0);
  // Bina's MEASURED speaking rate (chars/sec), learned from completed turns:
  // chars ÷ actual audio seconds. Phase A of the reveal uses it instead of
  // DEFAULT_REVEAL_CPS from the second turn on, so pacing self-calibrates to the
  // deployed voice/AI_TTS_SPEED/language rather than trusting a hardcoded prior.
  const measuredRevealCpsRef = useRef<number | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startRecordingInternalRef = useRef<() => void>(() => {});
  const disconnectRef = useRef<() => void>(() => {});

  // Keep refs in sync with state — refs are always current inside stale closures
  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
    // Clear silence prompt flag when Bina stops speaking
    if (!isAiSpeaking) isSilencePromptRef.current = false;
  }, [isAiSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isFollowUpRef.current = isFollowUp; }, [isFollowUp]);

  // ==========================================================================
  // Per-question timer — single source of truth.
  //
  // Historically there were 5+ ad-hoc setInterval blocks managing this timer
  // (anchored / decrement variants scattered across the pending-timer effect,
  // audio_end inline path, silent_discard resume, audio_end safety-net,
  // follow-up question_timer_started, and the new-question path). They drifted
  // apart, used different pause logic, and were the source of two bugs:
  //   1. Timer "stuck" — a missed WS event left the interval cleared with no
  //      restart path.
  //   2. Timer "jumps" 5–15 s — the 1000 ms tick was throttled by event-loop
  //      pressure (TTS streaming, MediaRecorder, viseme rAF) and the next
  //      tick snapped the displayed value to wall-clock truth.
  //
  // Fixes baked in here:
  //   - One implementation (`ensureQuestionTimerRunning`). All call sites
  //     route through this. No setInterval for the timer lives anywhere else.
  //   - 200 ms tick + monotonic anchor → smooth countdown, still drift-free
  //     vs. backend.
  //   - `startQuestionTimerExpiry` collects every "time's up" side effect in
  //     one place so all expiry paths behave identically.
  //   - Watchdog effect below restarts the interval if it ever ends up null
  //     while the candidate still has remaining seconds (no more "stuck"
  //     state when a WS event is dropped).
  //   - Clarification-cap effect below force-clears `isClarification` after
  //     60 s so a missing follow-up event can't perma-pause the countdown.
  // ==========================================================================
  const startQuestionTimerExpiry = useCallback(() => {
    setQuestionTimerExpired(true);
    questionTimerExpiredRef.current = true;
    setIsClarification(false);
    isClarificationRef.current = false;
    setShowSilenceBanner(false);
    if (silenceCountdownRef.current) {
      clearInterval(silenceCountdownRef.current);
      silenceCountdownRef.current = null;
    }
    setStatus("Time's up — moving to the next question...");
    setIsProcessing(false);
    isProcessingRef.current = false;
    clearNoResponseTimer();
    stopRecordingSilentRef.current();
    // Backend now handles the 2-min hard cap natively in _timer_from_speech:
    // it flushes captured audio (<=120s) into the natural end_turn pipeline
    // and sends `question_window_hard_cap` to us. The client used to also
    // send skip_question(source=timer_expired) here as a fallback, which
    // raced with the backend's flush and cancelled Bina's TTS mid-sentence.
    // Don't send anything from the client — let the backend drive the
    // advance. The watchdog below still has the 25s stuck-detection re-send.
  }, [clearNoResponseTimer]);

  const ensureQuestionTimerRunning = useCallback((durSeconds: number) => {
    if (durSeconds <= 0) return;
    questionTimerTotalRef.current = durSeconds;
    questionTimerStartedAtMsRef.current = performance.now();
    questionTimerPausedMsRef.current = 0;
    questionTimerPausedAtRef.current = null;
    setQuestionTimerSeconds(durSeconds);
    questionTimerSecondsRef.current = durSeconds;
    if (questionTimerIntervalRef.current) {
      clearInterval(questionTimerIntervalRef.current);
    }
    // 200 ms tick: keeps the displayed value visibly in sync with wall-clock
    // remaining even when the event loop is busy. The compute is monotonic
    // (`computeQuestionRemaining`), so accuracy vs. backend is preserved.
    questionTimerIntervalRef.current = setInterval(() => {
      // (2026-07-20, per user spec) The per-question answer clock runs ONLY
      // during the candidate's turn ("Your Turn"). Whenever Bina is speaking —
      // a question repeat (Repeat button or voice-asked), an "Are you there?"
      // nudge, or any prompt — the timer PAUSES, and resumes when the mic
      // reopens. pauseQuestionTimer()/resumeQuestionTimer() drive
      // questionTimerPausedAtRef; computeQuestionRemaining() subtracts paused
      // time, so while paused the displayed value freezes. (This replaces the
      // older "repeat time counts against the candidate" behavior.) We do NOT
      // auto-clear the pause each tick anymore — the pause is sticky until an
      // explicit resume.
      const remaining = computeQuestionRemaining();
      if (remaining === null) return;
      setQuestionTimerSeconds(remaining);
      questionTimerSecondsRef.current = remaining;
      // Record wall-clock of last successful tick — used by the
      // stuck-detection watchdog to spot a frozen UI even when the
      // interval itself was killed by a stray event.
      questionTimerLastTickMsRef.current = performance.now();
      if (remaining <= 0) {
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setTimeout(() => startQuestionTimerExpiry(), 0);
      }
    }, 200);
  }, [computeQuestionRemaining, startQuestionTimerExpiry]);

  // Pause the per-question answer clock while Bina is speaking (repeat / "Are
  // you there?" / any prompt). Idempotent; only pauses a timer that is actually
  // running (started, not already paused). The displayed value freezes until
  // resumeQuestionTimer() is called when the candidate's turn reopens.
  const pauseQuestionTimer = useCallback(() => {
    if (
      questionTimerStartedAtMsRef.current !== null &&
      questionTimerPausedAtRef.current === null
    ) {
      questionTimerPausedAtRef.current = performance.now();
    }
  }, []);

  // Resume the per-question clock when "Your Turn" opens — folds the elapsed
  // pause into the accumulated paused time so the remaining window is unchanged.
  const resumeQuestionTimer = useCallback(() => {
    if (questionTimerPausedAtRef.current !== null) {
      questionTimerPausedMsRef.current += performance.now() - questionTimerPausedAtRef.current;
      questionTimerPausedAtRef.current = null;
    }
  }, []);

  const startPendingQuestionTimer = useCallback((source: string) => {
    const pendingDur = questionTimerPendingRef.current;
    if (pendingDur === null) return;
    const timestamp = new Date().toISOString();
    console.log(`[Timer ${timestamp}] Starting pending timer from ${source}: ${pendingDur}s`);
    questionTimerPendingRef.current = null;
    questionTimerReceivedAtRef.current = null;
    questionTimerAwaitingSpeechRef.current = false;
    if (questionTimerExpiredRef.current) {
      setQuestionTimerExpired(false);
      questionTimerExpiredRef.current = false;
    }
    ensureQuestionTimerRunning(pendingDur);

    // ── Arm the Repeat-Question window ──
    // The candidate may click "Repeat Question" only during the FIRST
    // REPEAT_WINDOW_MS of the turn. After that it disables, so a candidate can't
    // reset their clock by repeating mid/late answer. A repeat-resume
    // (repeatFreezeRef path) does NOT re-arm — one repeat per turn. Skipped for
    // follow-ups/clarifications (same slot continuing, not a fresh window).
    if (repeatWindowTimerRef.current) { clearTimeout(repeatWindowTimerRef.current); repeatWindowTimerRef.current = null; }
    if (!repeatUsedThisTurnRef.current && !repeatFreezeRef.current && !isFollowUpRef.current && !isClarificationRef.current) {
      setCanRepeat(true);
      repeatWindowTimerRef.current = setTimeout(() => {
        setCanRepeat(false);
        repeatWindowTimerRef.current = null;
      }, REPEAT_WINDOW_MS);
    }
  }, [ensureQuestionTimerRunning]);

  // Self-healing watchdog: if the interval is null but seconds > 0 and we are
  // NOT legitimately paused (Bina speaking, clarification, fullscreen exit,
  // expired, awaiting a pending dispatch), restart from the frozen value.
  // Catches the "stuck timer" class of bugs caused by missed/dropped WS
  // events (interrupted without a follow-up question_timer_started, etc.).
  useEffect(() => {
    if (!isConnected || isClosing) return;
    let tickCounter = 0;
    const id = setInterval(() => {
      const cur = questionTimerSecondsRef.current;
      tickCounter += 1;
      // Heartbeat log every 5s while a timer is active — lets you confirm
      // the timer is alive in DevTools, and spot exactly when it stops
      // ticking if it gets stuck.
      if (tickCounter % 5 === 0 && cur !== null) {
        console.log('[INTERVIEW-DEBUG] timer heartbeat', {
          questionTimerSeconds: cur,
          intervalAlive: questionTimerIntervalRef.current !== null,
          isAiSpeaking: isAiSpeakingRef.current,
          isRecording: isRecordingRef.current,
          isProcessing: isProcessingRef.current,
          isClarification: isClarificationRef.current,
          isFullscreenExited: isFullscreenExitedRef.current,
          questionTimerExpired: questionTimerExpiredRef.current,
          questionTimerPending: questionTimerPendingRef.current,
          speechDetected: speechDetectedRef.current,
        });
      }
      // Stuck detection — TWO conditions can leave the timer frozen:
      //   (a) interval ref is null (e.g. cleared by `interrupted` and no
      //       fresh question_timer_started arrived to restart it)
      //   (b) interval is "alive" but hasn't actually ticked for > 3 s
      //       (e.g. tab throttling didn't recover, or a stuck flag is
      //       holding the inner pause branch). Wall-clock check.
      const _now_ms = performance.now();
      const _last_tick = questionTimerLastTickMsRef.current;
      const _no_tick_ms = _last_tick > 0 ? _now_ms - _last_tick : 0;
      const _interval_dead = questionTimerIntervalRef.current === null;
      const _interval_stalled = _last_tick > 0 && _no_tick_ms > 3000;
      const _should_be_running = (
        cur !== null
        && cur > 0
        && !questionTimerExpiredRef.current
        && !isAiSpeakingRef.current
        && !isProcessingRef.current
        && !isFullscreenExitedRef.current
        && !repeatFreezeRef.current   // Repeat re-speak in progress — timer is
                                      // intentionally frozen; do NOT auto-restart
                                      // it (that was un-freezing it right after
                                      // the Repeat click, before speaking_started).
        && questionTimerPendingRef.current === null
      );
      // Force-clear a stuck clarification flag if the timer has been
      // frozen for >5 s under it (in case the 60-s clarification
      // watchdog hasn't fired yet but the candidate is clearly waiting).
      if (
        _should_be_running
        && isClarificationRef.current
        && _interval_stalled
        && _no_tick_ms > 5000
      ) {
        console.warn(
          '[INTERVIEW-DEBUG] STUCK CLARIFICATION FLAG — auto-clearing after stalled timer',
          { remaining: cur, no_tick_ms: Math.round(_no_tick_ms) }
        );
        setIsClarification(false);
        isClarificationRef.current = false;
      }
      if (
        _should_be_running
        && !isClarificationRef.current
        && (_interval_dead || _interval_stalled)
      ) {
        console.warn('[INTERVIEW-DEBUG] STUCK TIMER detected — restarting', {
          remaining: cur,
          isRecording: isRecordingRef.current,
          isProcessing: isProcessingRef.current,
          interval_dead: _interval_dead,
          interval_stalled: _interval_stalled,
          no_tick_ms: Math.round(_no_tick_ms),
        });
        ensureQuestionTimerRunning(cur);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isConnected, isClosing, ensureQuestionTimerRunning]);

  // Clarification-pause cap: if backend never sends the clearing event,
  // force-clear after 60 s so the timer cannot be paused indefinitely.
  useEffect(() => {
    if (!isClarification) return;
    const t = setTimeout(() => {
      console.warn("[Timer watchdog] Clarification pause exceeded 60s — auto-clearing");
      setIsClarification(false);
      isClarificationRef.current = false;
    }, 60_000);
    return () => clearTimeout(t);
  }, [isClarification]);

  // (Watchdog removed.) The previous "post-expiry stuck recovery" watchdog
  // fired a skip_question after 25-90s when the candidate stayed on the
  // "TIME UP" screen. It was wrong: the backend's natural end-of-question
  // pipeline (ASR + LLM evaluation + LLM next-Q + TTS) takes 15-40s, so a
  // watchdog firing mid-pipeline DISCARDED a successfully captured answer
  // (observed on session ai-1f145baf Q#3 — full 2-min Tamil/English
  // transcript captured then dropped by the 25s watchdog before Bina
  // finished generating Q#4). Trust the hard-cap + the backend's own 180s
  // pipeline-level timeout. If Bina's pipeline genuinely hangs, the
  // backend cancels and unblocks itself.

  // Fullscreen-exit watchdog: the per-question + global timers both pause
  // while `isFullscreenExited` is true. If the browser misses the return
  // event (alt-tab race, OS workspace switch, `fullscreenchange` doesn't
  // re-fire) the flag stays true forever and the timer appears frozen. Poll
  // every 2s — if the flag is true but the page IS visible AND we are still
  // inside fullscreen, the exit isn't real anymore; clear the flag and let
  // the timers resume. This is a safety net; the normal recovery paths are
  // `handleFullscreenChange` and `handleVisibilityChange` above.
  useEffect(() => {
    if (!isFullscreenExited) return;
    const id = setInterval(() => {
      if (!isFullscreenExitedRef.current) return;
      const fullscreenDocument = document as VendorFullscreenDocument;
      const isActuallyExited =
        document.hidden ||
        !(
          document.fullscreenElement ||
          fullscreenDocument.webkitFullscreenElement ||
          fullscreenDocument.mozFullScreenElement ||
          fullscreenDocument.msFullscreenElement
        );
      if (!isActuallyExited) {
        console.warn('[Timer watchdog] isFullscreenExited stuck true while page is visible + fullscreen — auto-clearing');
        isFullscreenExitedRef.current = false;
        setIsFullscreenExited(false);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [isFullscreenExited]);

  // Generic "timer didn't decrement" watchdog. If questionTimerSeconds hasn't
  // changed in N seconds AND no legitimate pause flag is set, the timer is
  // stuck — likely because a pause condition flipped true and never flipped
  // back. Logs the full flag state for diagnostics + force-restarts from the
  // current frozen value. Catches the cases the more specific watchdogs miss
  // (e.g. all pause flags are false but the interval got cleared during a GC
  // pause and was never re-armed).
  useEffect(() => {
    if (!isConnected || isClosing) return;
    let lastSeen = questionTimerSecondsRef.current;
    let stableSinceMs = performance.now();
    const id = setInterval(() => {
      const cur = questionTimerSecondsRef.current;
      // Reset the "stable since" stopwatch whenever the value changes (timer
      // is alive) or the timer is null (no active question).
      if (cur === null || cur !== lastSeen) {
        lastSeen = cur;
        stableSinceMs = performance.now();
        return;
      }
      // Value unchanged. If we're inside a legitimate pause window, that's
      // expected — keep waiting.
      if (
        isAiSpeakingRef.current
        || isProcessingRef.current
        || isClarificationRef.current
        || isFullscreenExitedRef.current
        || questionTimerExpiredRef.current
        || questionTimerPendingRef.current !== null
      ) {
        stableSinceMs = performance.now();
        return;
      }
      // If the interval is still ticking, a temporarily unchanged whole-second
      // display is not itself evidence of a stuck timer. Only self-heal when
      // the visible value is frozen AND the underlying interval stopped
      // ticking too.
      const lastTickMs = questionTimerLastTickMsRef.current;
      const intervalAlive = questionTimerIntervalRef.current !== null;
      const tickStalled = lastTickMs > 0 && (performance.now() - lastTickMs) > 3000;
      if (intervalAlive && !tickStalled) {
        stableSinceMs = performance.now();
        return;
      }
      // No pause excuse — if it's been > 3s without a tick, the timer is
      // stuck. Restart from the frozen value.
      const stuckMs = performance.now() - stableSinceMs;
      if (stuckMs > 3000 && cur > 0) {
        console.warn('[Timer watchdog] Per-Q timer hasn\'t decremented in', Math.round(stuckMs), 'ms — restarting', {
          frozenValue: cur,
          intervalAlive,
          tickStalled,
          isAiSpeaking: isAiSpeakingRef.current,
          isRecording: isRecordingRef.current,
          isProcessing: isProcessingRef.current,
        });
        ensureQuestionTimerRunning(cur);
        stableSinceMs = performance.now();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isConnected, isClosing, ensureQuestionTimerRunning]);

  // ── Pending Timer Watchdog ──────────────────────────────────────────────
  // Recovery for the "Bina finished but timer stuck" race. Three known
  // causes: (1) avatar 3D load timeout breaks the playback-ended callback,
  // (2) WebSocket drops the audio_end event so audioEndReceivedRef stays
  // false, (3) playback-ended fires before audio_end arrives and the guard
  // rejects it. In all three cases isAiSpeaking stays TRUE indefinitely and
  // the pending timer never starts.
  //
  // 20s threshold: normal Bina TTS playback completes in 5-15s. If we still
  // have a pending dur AND isAiSpeaking is still true after 20s, the
  // playback callback chain is broken — force-flip and start the timer so
  // the candidate isn't frozen.
  useEffect(() => {
    if (questionTimerPendingRef.current === null) return;
    const stuckGuard = setTimeout(() => {
      if (questionTimerPendingRef.current === null) return;
      if (!isAiSpeakingRef.current) return; // resolved naturally
      console.warn('[INTERVIEW-DEBUG] Pending timer STUCK — forcing recovery', {
        pendingDur: questionTimerPendingRef.current,
        audioEndReceived: audioEndReceivedRef.current,
      });
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      setStatus("Your turn — speak now...");
      // Re-open mic if it was disabled while Bina was "speaking" but never
      // re-enabled (since the normal handleAllAudioFinished path didn't run).
      if (mediaStreamRef.current && !isMutedRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      if (wsRef.current?.readyState === WebSocket.OPEN
          && !isMutedRef.current
          && !isProcessingRef.current
          && !isRecordingRef.current
          && !isFaceBlockedRef.current) {
        startRecordingInternalRef.current();
      }
    }, 20000);
    return () => clearTimeout(stuckGuard);
  }, [questionTimerPendingTick, avatarState]);

  // ── Message-Independent Speaking-State Watchdog ────────────────────────
  // The pending-timer watchdog above only fires when `question_timer_started`
  // has been received and stored as pending. If the WebSocket back-pressures
  // (audio chunks pile up in the receive buffer, JSON messages get queued
  // behind them, the browser's onmessage drainer falls behind), that
  // `question_timer_started` message can be lost — and the candidate sees
  // a frozen UI with no timer and no "Your turn" prompt.
  //
  // This second watchdog has NO dependency on backend messages: it fires
  // purely off the local `isAiSpeaking` flag and the audio-chunk arrival
  // anchor. Trigger: 30s after isAiSpeaking flipped true, if no chunks
  // have arrived in the last 5s and the flag is still true, force-recover.
  // Falls back to a 120s timer (the standard timed-mode per-question budget)
  // since the actual duration message may have been dropped.
  useEffect(() => {
    if (!isAiSpeaking) return;
    const startedAt = Date.now();
    const watchdog = setTimeout(() => {
      if (!isAiSpeakingRef.current) return; // resolved naturally
      const lastChunkAt = lastPcmAtMsRef.current;
      const sinceLastChunk = lastChunkAt ? Date.now() - lastChunkAt : Infinity;
      if (sinceLastChunk < 5000) {
        // Chunks still flowing — playback is genuinely ongoing, don't intervene.
        return;
      }
      console.warn('[InterviewUI] Speaking-state watchdog firing — likely dropped audio_end/timer_started', {
        isAiSpeakingDurationMs: Date.now() - startedAt,
        sinceLastChunkMs: sinceLastChunk === Infinity ? 'no_chunks_ever' : sinceLastChunk,
        hasPendingTimer: questionTimerPendingRef.current !== null,
      });
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      const dur = questionTimerPendingRef.current ?? 120;
      questionTimerPendingRef.current = dur;
      questionTimerTotalRef.current = dur;
      questionTimerReceivedAtRef.current = questionTimerReceivedAtRef.current ?? Date.now();
      setStatus("Your turn — speak now...");
      if (mediaStreamRef.current && !isMutedRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      if (wsRef.current?.readyState === WebSocket.OPEN
          && !isMutedRef.current
          && !isProcessingRef.current
          && !isRecordingRef.current
          && !isFaceBlockedRef.current) {
        startRecordingInternalRef.current();
      }
    }, 30000);
    return () => clearTimeout(watchdog);
  }, [isAiSpeaking, avatarState]);

  // When the per-question timer expires, the client sends skip_question to the
  // backend (see the timer-expiry block above). The backend's handle_skip_question
  // advances to the next question and sends question_timer_started, which resets
  // the client timer via the question_timer_started handler. No client-side
  // auto-restart is needed — the backend is the single source of truth for
  // question progression.

  // VAD settings
  const silenceStartRef = useRef<number | null>(null);
  // AII14 — one-shot guard so the "holding turn open" line is logged once per
  // pause instead of every analyser frame. Reset when speech resumes / the turn
  // changes (see the confirmation driver effect).
  const silenceHoldLoggedRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const speechDetectedAtRef = useRef<number | null>(null);
  const speechStartSentRef = useRef(false); // fires speech_started once per recording session
  const silenceThresholdRef = useRef(0.005);
  const silenceDurationMsRef = useRef(15000); // pre-connect fallback; overridden by vad_config.silence_duration_ms from backend .env (now 15s → 5s silent + 10→1 counter)
  const MAX_CLIENT_SPEECH_THRESHOLD = 0.008;
  const POSSIBLE_SPEECH_LEVEL = 0.0018;
  const MIN_POSSIBLE_SPEECH_FRAMES = 6;
  const QUIET_SPEECH_ACTIVITY_LEVEL = 0.0032;
  // Ceiling for what counts as "ambient/room noise" that the noise floor may
  // learn. The OLD code only learned ambient while avgLevel < QUIET_SPEECH_
  // ACTIVITY_LEVEL (0.0032), so once the mic-gain-amplified room noise sat
  // ABOVE that (fans, chatter, keyboard), the floor saturated and every
  // adaptive threshold (ambient×mult) stayed too low → noise was treated as
  // speech. This higher cap lets the floor track real noise up to ~0.012 while
  // still excluding true speech (amplified speech peaks are ~0.03–0.06, well
  // above this), so the thresholds rise ABOVE the noise and only real speech
  // trips them. (Quiet rooms are unaffected — the floor just stays low.)
  const AMBIENT_LEARN_CAP = 0.012;
  // Voice-band spectral gate. Human speech concentrates its energy in roughly
  // 200–3400 Hz (fundamental + formants). Broadband noise (fans, hiss), low
  // rumble/hum, and much music spread energy outside that band, so their
  // in-band fraction is lower. A frame only counts as "speech" if BOTH loud
  // enough AND voice-like. Threshold is deliberately LENIENT (real speech is
  // ~0.6–0.9; flat broadband noise ~0.15) so it rejects clearly-non-voice sound
  // without ever blocking a real voice. Tune via ?debug=1 (shows live ratio).
  const VOICE_BAND_LOW_HZ = 200;
  const VOICE_BAND_HIGH_HZ = 3400;
  const VOICE_BAND_MIN_RATIO = 0.35;
  const POSSIBLE_SPEECH_NOISE_MULTIPLIER = 2.2;
  const POSSIBLE_SPEECH_MARGIN = 0.0012;
  const IN_TURN_NOISE_MULTIPLIER = 2.2;
  const IN_TURN_ACTIVITY_MARGIN = 0.0015;
  const STRONG_IN_TURN_NOISE_MULTIPLIER = 3.1;
  const STRONG_IN_TURN_ACTIVITY_MARGIN = 0.0024;
  const MIN_STRONG_IN_TURN_LEVEL = 0.0056;
  const TRANSCRIPT_ACTIVITY_GRACE_MS = 1800;
  const REALTIME_TRANSCRIPT_BOOTSTRAP_GRACE_MS = 2500;
  // Safety net for server-side EndOfTurn (streaming providers). Normally the
  // SERVER decides when the turn ends, so the client silence cutoff is disabled.
  // But if the provider's EndOfTurn signal never fires after the candidate goes
  // quiet, the turn would sit idle until the 130 s hard cap — the reported
  // "answer finished but interview stays idle" bug. If TRUE silence persists this
  // long (well beyond a natural thinking pause and far past when EndOfTurn should
  // have fired), the client force-ends the turn. Generous on purpose so it never
  // pre-empts the provider's smarter semantic end-of-turn during normal pauses.
  const SERVER_EOT_SILENCE_FALLBACK_MS = 15000;
  const LIVE_BATCH_CHAR_THRESHOLD = 320;
  const liveBatchSentCharsRef = useRef(0);
  const liveBatchIndexRef = useRef(0);
  const liveBatchStopRequestedRef = useRef(false);

  // VAD warmup: suppress speech detection for the first N ms after the mic opens.
  // The browser echo canceller needs a few hundred ms of audio to build its model.
  // Without this, Bina's TTS echo can trigger VAD immediately after she stops speaking.
  const VAD_WARMUP_MS = 600;
  const vadWarmupUntilRef = useRef<number>(0); // timestamp after which VAD is live

  // Fix 3: ALSO suppress VAD for a short window after TalkingHead's audible
  // playback actually ends. 600ms of post-mic-open warmup isn't enough for
  // Bluetooth headsets or rooms with long reverb tails — Bina's TTS tail can
  // bleed through the echo canceller for 500–1500ms and trigger a false
  // speech_started, which in turn cancels the backend's silence nudge and
  // triggers bogus follow-up flows. `playbackEchoGuardUntilRef` is stamped
  // inside the onAudioEnd callback (pendingStreamStartRef) and also inside
  // the safety-net fallback so every end-of-playback path is covered.
  const PLAYBACK_ECHO_GUARD_MS = 800;
  const playbackEchoGuardUntilRef = useRef<number>(0);

  // Consecutive frames above threshold before confirming speech (speech ONSET
  // → sends speech_started, which suppresses the initial 20s "Are you there?"
  // nudge). At ~93ms/frame, 5 frames ≈ 460ms of CONTINUOUS voice-like sound.
  // Raised 3→5 so a short background burst (cough, one nearby word, door click)
  // can't falsely register as the candidate starting to speak and cancel the
  // 20s nudge. The counter resets to 0 on any quiet/non-voice frame, so it must
  // be 5 IN A ROW. The pre-speech ring buffer still captures the first words, so
  // the slightly longer confirmation window loses no audio.
  const speechFrameCountRef = useRef(0);
  const MIN_SPEECH_FRAMES = 5;

  // ── Adaptive mic gain (headset / low-gain mic normalization) ──────────────
  // autoGainControl is OFF (it distorts levels for ASR), so quiet mics —
  // wired earbuds, Bluetooth headsets — produce low-amplitude audio. With the
  // amplitude-based VAD that caused two headphone bugs: (1) speech confirmed
  // late → opening words dropped, (2) quiet ongoing speech read as silence →
  // turn auto-cut to the next question mid-answer. We track a slowly-decaying
  // recent peak and boost both the VAD level AND the PCM sent to ASR toward a
  // target, bounded so noise can't be over-amplified. Built-in mics already
  // near the target get gain≈1 (unchanged). Ambient-relative thresholds + the
  // RNNoise worklet scale with the boost, so noise rejection still holds.
  const micRecentPeakRef = useRef(0);
  const MIC_GAIN_TARGET_PEAK = 0.045; // desired avg-abs level for confident VAD/ASR
  const MIC_GAIN_PEAK_FLOOR = 0.012;  // never divide by less than this (caps silence-time gain)

  // ── Mic device profile — ONE source of truth for all device-dependent audio
  // handling. The detected type maps to four condition-based knobs:
  //   (1) gainMax            → software gain ceiling (quiet mics need more)
  //   (2) echoCancellation   → OFF for headphones (no speaker→mic echo path)
  //   (3) isBluetooth        → HFP is quietest + laggiest → most lenient knobs
  //   (4) silenceMultiplier  → stretch the VAD silence window for quiet/laggy
  //                            mics so a real answer isn't cut off mid-sentence
  // Built-in mic = strict defaults; wired headset = relaxed; Bluetooth = most
  // relaxed; unknown = safe middle ground (echo cancellation stays ON).
  type MicType = 'builtin' | 'wired_headphone' | 'bluetooth' | 'unknown';
  const micTypeRef = useRef<MicType>('unknown');
  const micGainMaxRef = useRef(6);            // (1) gain ceiling
  // Per-device target level. This — NOT gainMax — is the real gain lever: the
  // achievable gain is TARGET / PEAK_FLOOR, so a higher target = louder mic.
  // Headphone/earbud mics run quiet, so they get a higher target for clearer ASR.
  const micGainTargetRef = useRef(MIC_GAIN_TARGET_PEAK);
  const micSilenceMultiplierRef = useRef(1);  // (4) silence-window multiplier

  // Track the room's baseline energy and the candidate's recent speech peak so
  // quiet headset audio can keep the turn alive, while background office noise
  // still allows the 5s silence timeout to close the turn.
  const ambientNoiseFloorRef = useRef(POSSIBLE_SPEECH_LEVEL * 0.5);
  const lastMeaningfulAudioAtRef = useRef<number | null>(null);
  const speechPeakLevelRef = useRef(0);
  const inTurnSpeechFrameCountRef = useRef(0);
  const MIN_IN_TURN_SPEECH_FRAMES = 3;
  // Timestamp of the last STRONG voice-band frame (clears strongInTurnActivity-
  // Threshold). Real speech — even quiet — produces these; steady mic/Bluetooth
  // self-noise (which reads "voice-like" at ratio ~0.6-0.7 and sits just above
  // ambient×1.5 on Realtek/BT mics) does NOT. Used to stop the soft-voice guard
  // from resetting the silence clock forever on noisy mics, so the 8s end-turn
  // actually fires instead of idling to the 2-min hard cap. Confirmed via the
  // ?debug=1 overlay: Realtek idle noise Level≈0.0091, VoiceRatio≈0.70, so the
  // old soft-voice guard (ambient×1.5≈0.008) reset the clock every noise blip.
  const lastStrongVoiceAtRef = useRef<number | null>(null);
  // Sustained-activity gate for the silence-clock RESET. The VAD runs on ~90ms
  // frames; the old code reset the silence countdown on a SINGLE active frame,
  // so one ~90ms blip (a cough, a door click, one background word) restarted the
  // whole 8s countdown → with any intermittent room noise the turn never ended.
  // We now require the active streak to last at least SUSTAINED_ACTIVE_MS of
  // CONTINUOUS voice-like frames before it counts as "real speech" and resets
  // the clock. A momentary blip (< this) is ignored, so the countdown keeps
  // running through it. `activeStreakStartRef` = when the current unbroken run
  // of active frames began (null when the last frame was inactive).
  const activeStreakStartRef = useRef<number | null>(null);
  const SUSTAINED_ACTIVE_MS = 400; // ~4-5 frames of continuous voice before reset
  // Dip tolerance ("hangover") for the active streak. Natural speech is not a
  // solid block of above-threshold frames — there are ~50-150ms gaps between
  // words, unstressed syllables, and after plosives that dip BELOW the
  // peak-relative in-turn threshold. The old code nulled the streak on the
  // FIRST such frame (activeStreakStartRef = null), so `_sustained` (streak >=
  // 300ms) could never accumulate for an ordinary speaker: every couple of
  // frames a dip restarted it from zero. On realtime providers the
  // transcript-driven reset hid this; on BATCH providers (gpt-4o-transcribe,
  // gemini, sarvam, assemblyai) there is NO live transcript, so the streak was
  // the only thing keeping the turn alive — and continuous speech wound up to
  // the 8s silence clock and got cut off mid-answer. We now let the streak
  // survive short sub-threshold dips: the streak is only broken when the gap
  // since the last active frame exceeds STREAK_DIP_GRACE_MS. `lastActiveFrameAtRef`
  // = timestamp of the most recent active frame within the current streak.
  const lastActiveFrameAtRef = useRef<number | null>(null);
  const STREAK_DIP_GRACE_MS = 400; // tolerate ~4-5 frames of inter-word gap

  // Pre-speech audio ring buffer. Captures PCM frames during the VAD warmup
  // (~600ms) and the speech-confirmation window (~280ms) so the candidate's
  // FIRST WORD is not lost. Without this, ~850ms of audio gets dropped before
  // `speechDetectedRef` flips true → Whisper transcribes from the middle of
  // the answer ("half la irunthuthan eduthkuthu" symptom).
  // On speech confirmation, the buffer is flushed to backend BEFORE live
  // frames start flowing. Sized at 16000 samples/s × 10s = 160000 Int16s.
  const preSpeechPCMRingRef = useRef<Int16Array[]>([]);
  const preSpeechPCMSampleCountRef = useRef(0);
  const PRE_SPEECH_BUFFER_MAX_SAMPLES = 160000; // ~10s at 16kHz

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

  const removeAudioDeviceChangeListener = () => {
    if (audioDeviceChangeListenerRef.current) {
      navigator.mediaDevices.removeEventListener('devicechange', audioDeviceChangeListenerRef.current);
      audioDeviceChangeListenerRef.current = null;
    }
  };

  const teardownRecordingMedia = useCallback((clearPinnedDevice: boolean = false) => {
    removeAudioDeviceChangeListener();
    // Keep the answer-capture device pinned across turns so Q2+ stays on the
    // same headset/mic that worked for Q1 unless we explicitly clear it.
    if (clearPinnedDevice) {
      pinnedAudioDeviceIdRef.current = undefined;
    }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    micAnalyserRef.current = null;
  }, []);

  // Classify the active mic from its device label. Heuristic (labels vary by
  // OS/browser/locale) but the common ones are stable. Bluetooth is matched
  // FIRST and kept distinct from wired headsets because its HFP profile is the
  // quietest + laggiest and needs the most lenient handling. Falls back to
  // 'unknown' → safe defaults (echo cancellation ON).
  const classifyMicType = useCallback((label: string): MicType => {
    const l = (label || '').toLowerCase();
    if (!l) return 'unknown';
    // (3) Bluetooth / hands-free profile — check first (most specific).
    if (/bluetooth|hands[\s-]?free|\bhfp\b|\bhsp\b|airpod|earpods|galaxy buds|\bbuds\b|\bwh-|\bwf-/.test(l)) {
      return 'bluetooth';
    }
    // Wired headsets / earphones — no speaker→mic acoustic echo path.
    if (/headset|headphone|earphone|earbud|jabra|\bplantronics\b|\bsennheiser\b/.test(l)) {
      return 'wired_headphone';
    }
    // Built-in / internal mics — laptop speaker echo IS a real path.
    if (/built[\s-]?in|internal|realtek|macbook|microphone array|digital microphone|intel smart sound|default/.test(l)) {
      return 'builtin';
    }
    return 'unknown';
  }, []);

  const isHeadphoneType = useCallback(
    (t: MicType) => t === 'wired_headphone' || t === 'bluetooth',
    [],
  );

  // Resolve the per-device profile and set the four condition-based knobs.
  // Called once on device detection; the hot audio loop reads the refs.
  const applyMicProfile = useCallback((type: MicType) => {
    micTypeRef.current = type;
    switch (type) {
      case 'bluetooth':
        // (1) quietest mic → highest gain + highest target.
        micGainMaxRef.current = 12;
        micGainTargetRef.current = 0.090;   // ~2× builtin → up to ~7.5× gain
        // Silence window is UNIFORM 8s for every mic type (multiplier 1.0). The
        // gain boost above lifts quiet BT/wired audio above the VAD threshold,
        // so the old stretched windows (×1.6/×1.4 → 11-13s) are no longer needed
        // — and they made these mics wait far too long before ending the turn.
        micSilenceMultiplierRef.current = 1.0;
        break;
      case 'wired_headphone':
        micGainMaxRef.current = 10;
        micGainTargetRef.current = 0.10;    // louder for quiet wired headset mics → up to ~8.3× gain
        micSilenceMultiplierRef.current = 1.0;  // uniform 8s (see bluetooth note)
        break;
      case 'builtin':
        // Quiet built-in mics (e.g. laptop Realtek) can sit at ~0.006 avgLevel —
        // BELOW the VAD activity threshold (0.0076) and never reaching the
        // strong threshold (0.0107) — so the candidate is cut off as "silence"
        // while actually speaking (production auto-skips, console 1.txt: Q8/Q10
        // ended ~12s in at avgLevel 0.004-0.006). Raise the gain ceiling + target
        // so quiet built-in audio is boosted (~6.8×) above the activity/strong
        // thresholds. The peak-relative thresholds scale with the boosted signal
        // too, but the FIXED absolute floors (activity 0.0076 / strong 0.0107)
        // are what quiet speech now clears. silenceMultiplier stays 1.0 — NO
        // grace window, so a genuinely finished answer still ends promptly.
        micGainMaxRef.current = 10;
        micGainTargetRef.current = 0.080;   // ~6.8× effective gain (was 0.045 → 3.8×)
        micSilenceMultiplierRef.current = 1.0;
        break;
      default: // unknown — safe middle ground
        micGainMaxRef.current = 8;
        micGainTargetRef.current = 0.055;
        micSilenceMultiplierRef.current = 1.0;  // uniform 8s (see bluetooth note)
    }
    console.log('[InterviewUI] Mic profile applied', {
      type,
      gainMax: micGainMaxRef.current,
      gainTarget: micGainTargetRef.current,
      maxEffectiveGain: (micGainTargetRef.current / MIC_GAIN_PEAK_FLOOR).toFixed(1),
      silenceMultiplier: micSilenceMultiplierRef.current,
      echoCancellation: !isHeadphoneType(type),
    });
  }, [isHeadphoneType]);

  // (2) Echo cancellation: OFF for headphones (no speaker→mic echo to cancel;
  // leaving it on can duck/attenuate the candidate's own quiet speech). ON for
  // built-in/unknown (laptop speaker echo is real). Uses applyConstraints
  // (no re-acquire → no permission re-prompt). Best-effort.
  const tuneTrackForMicType = useCallback(async (track: MediaStreamTrack, micType: MicType) => {
    if (!isHeadphoneType(micType)) return; // builtin/unknown keep EC on (the acquisition default)
    try {
      await track.applyConstraints({
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
      });
      console.log(`[InterviewUI] ${micType} detected — echo cancellation disabled for clearer near-end speech`);
    } catch (err) {
      console.warn('[InterviewUI] applyConstraints for headphone tuning failed (non-fatal):', err);
    }
  }, [isHeadphoneType]);

  const getSharedRecordingAudioStream = useCallback(async (): Promise<MediaStream> => {
    const findSharedTrack = () =>
      webcamStreamRef.current
        ?.getAudioTracks()
        .find(track => track.readyState === 'live');

    let sharedTrack = findSharedTrack();
    if (!sharedTrack) {
      console.warn('[InterviewUI] Shared webcam audio track unavailable — attempting webcam reacquire');
      const reacquired = (await webcamRef.current?.reacquire()) ?? false;
      if (!reacquired) {
        throw new Error('Shared webcam stream unavailable');
      }
      sharedTrack = findSharedTrack();
    }

    if (!sharedTrack) {
      throw new Error('No live shared microphone track found');
    }

    if (sharedTrack.label) {
      setActiveMicLabel(sharedTrack.label);
    }
    const sharedDeviceId = sharedTrack.getSettings?.().deviceId;
    if (sharedDeviceId) {
      pinnedAudioDeviceIdRef.current = sharedDeviceId;
    }

    const micType = classifyMicType(sharedTrack.label);
    applyMicProfile(micType);
    const cloned = sharedTrack.clone();
    await tuneTrackForMicType(cloned, micType);
    return new MediaStream([cloned]);
  }, [classifyMicType, applyMicProfile, tuneTrackForMicType]);

  const getDedicatedRecordingAudioStream = useCallback(async (): Promise<MediaStream> => {
    const headsetFriendlyAudio: MediaTrackConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: true,   // browser WebRTC handles speaker echo
      noiseSuppression: true,   // browser suppression as baseline; RNNoise worklet layers on top
      autoGainControl: false,   // keep off — AGC distorts quiet speech levels for ASR
    };

    const attempts: Array<{ label: string; constraints: MediaStreamConstraints }> = [];
    if (pinnedAudioDeviceIdRef.current) {
      attempts.push({
        label: "pinned_device",
        constraints: {
          audio: {
            ...headsetFriendlyAudio,
            deviceId: { exact: pinnedAudioDeviceIdRef.current },
          },
        },
      });
    }
    attempts.push({
      label: "headset_friendly_audio",
      constraints: { audio: headsetFriendlyAudio },
    });
    attempts.push({
      label: "browser_default_audio",
      constraints: { audio: true },
    });

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
        const liveTrack = stream.getAudioTracks().find(track => track.readyState === 'live');
        if (!liveTrack) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error('No live dedicated microphone track found');
        }
        if (liveTrack.label) {
          setActiveMicLabel(liveTrack.label);
        }
        const actualDeviceId = liveTrack.getSettings?.().deviceId;
        if (actualDeviceId) {
          pinnedAudioDeviceIdRef.current = actualDeviceId;
        }
        // Detect device type, set its profile (gain/silence/EC), and tune EC.
        const micType = classifyMicType(liveTrack.label);
        applyMicProfile(micType);
        await tuneTrackForMicType(liveTrack, micType);
        console.log('[InterviewUI] Dedicated answer microphone opened', {
          attempt: attempt.label,
          label: liveTrack.label || 'unknown',
          deviceId: actualDeviceId || 'unknown',
          micType,
        });
        return stream;
      } catch (err) {
        lastError = err;
        console.warn(`[InterviewUI] Dedicated answer microphone attempt failed (${attempt.label})`, err);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Dedicated microphone unavailable');
  }, [classifyMicType, applyMicProfile, tuneTrackForMicType]);

  const getRecordingAudioStream = useCallback(async (): Promise<MediaStream> => {
    let stream: MediaStream;
    try {
      stream = await getDedicatedRecordingAudioStream();
    } catch (dedicatedErr) {
      console.warn('[InterviewUI] Dedicated answer microphone unavailable — falling back to webcam audio track', dedicatedErr);
      stream = await getSharedRecordingAudioStream();
    }
    // Point the screen-recording audio mix at the SAME device the candidate is
    // answering on. That mix is built in CandidateAIInterviewPortal before this
    // component mounts, so its first capture may be the OS default (often the
    // laptop array mic) even when the candidate speaks into a headset — which
    // made them almost inaudible in the saved Interview View. Best-effort: the
    // portal ignores the call when no mix is active.
    try {
      const pinned = pinnedAudioDeviceIdRef.current;
      if (pinned) {
        // Global so a mid-interview re-share rebuilds the mix on the right device
        // immediately, instead of waiting for the next answer turn to retarget.
        (window as any).__interviewMicDeviceId = pinned;
        void (window as any).__interviewSetRecordingMic?.(pinned);
      }
    } catch { /* best-effort — never block mic acquisition */ }
    return stream;
  }, [getDedicatedRecordingAudioStream, getSharedRecordingAudioStream]);

  const flushPreSpeechAudioToBackend = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN &&
      !isAiSpeakingRef.current &&
      preSpeechPCMRingRef.current.length > 0
    ) {
      for (const buf of preSpeechPCMRingRef.current) {
        wsRef.current.send(buf.buffer);
      }
    }
    preSpeechPCMRingRef.current = [];
    preSpeechPCMSampleCountRef.current = 0;
  }, []);

  // Save AI message — called from finalizePlayback at the TRUE end-of-audio.
  // Stop any ongoing reveal loop and flush the live bubble into the chat
  // as one committed assistant message. Because finalizePlayback is gated
  // on firstPcmAt + audioMs, this can only fire AFTER the audio has
  // actually finished playing — guaranteeing the live bubble transitioning
  // into the chat message coincides with Bina's audio ending, which is
  // exactly when "Your turn" should surface.
  const saveAiMessage = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    // Always use full tokenBuffer — currentAiTextRef may be partially revealed
    const text = tokenBufferRef.current.trim();
    // Learn Bina's real speaking rate from this completed turn so the NEXT
    // turn's Phase A paces off measurement instead of DEFAULT_REVEAL_CPS. Runs
    // here because this is the one place where both the final text length and
    // the final audio duration are known (currentTurnAudioMsRef is reset by the
    // next turn's first token, not before). Short clips are skipped — their
    // ratio is dominated by leading/trailing silence. Smoothed so one odd turn
    // (a long pause mid-sentence) can't skew the next, and clamped to a sane
    // speech range so a bad sample can never make the caption race.
    const turnAudioSec = currentTurnAudioMsRef.current / 1000;
    if (text.length > 20 && turnAudioSec > 1.5) {
      const sample = text.length / turnAudioSec;
      if (sample >= 6 && sample <= 30) {
        const prev = measuredRevealCpsRef.current;
        measuredRevealCpsRef.current = prev === null ? sample : prev * 0.7 + sample * 0.3;
        if (REVEAL_DEBUG) {
          console.debug(`[Reveal] cps sample=${sample.toFixed(1)} smoothed=${measuredRevealCpsRef.current.toFixed(1)} (chars=${text.length} audio=${turnAudioSec.toFixed(2)}s)`);
        }
      }
    }
    if (text) {
      const wasFollowup = isCurrentFollowupRef.current;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text,
        timestamp: nowIST(),
        isFollowup: wasFollowup,
        // Tag with the question being asked so a late background-transcribed
        // answer (decoupled flow) can be attached right after its own bubble.
        questionNumber: questionNumberRef.current ?? undefined,
      }]);
      // Reset for the next turn — backend will re-set if the next question
      // is also a follow-up.
      isCurrentFollowupRef.current = false;
      currentAiTextRef.current = "";
      tokenBufferRef.current = "";
      revealedCharsRef.current = 0;
      setCurrentAiText("");
    }
  }, []);

  // Token reveal system — the live "Bina" bubble that reveals tokens as
  // they stream.
  //
  // There are TWO reveal phases, because the total audio duration is
  // unknown until the backend sends `audio_end`:
  //
  //   Phase A (streaming): audio_end not yet received, so the total TTS
  //   duration is UNKNOWN — every "end of audio" figure available
  //   (`currentTurnAudioMsRef`, the tracker's scheduled end) describes only
  //   what has ARRIVED so far. Fraction math is therefore invalid here: it
  //   divides the played position by a partial total, which inflates progress
  //   toward 1 and reveals text the voice hasn't reached — worst at the start
  //   of a turn, where the partial total is smallest. So Phase A paces by
  //   RATE (chars/sec, see DEFAULT_REVEAL_CPS) instead of by fraction. Rate
  //   pacing cannot inflate, because it never divides by an unknown.
  //
  //   Phase B (post-audio_end): the totals are final, so fraction math is
  //   exact. Progress is measured against the AUDIBLE span and drives the
  //   reveal to land REVEAL_LEAD_MS before the voice stops.
  //
  // The reveal loop KEEPS ticking while Bina is still audible, even once
  // all text is revealed, so the bubble cannot "finish" before audio does.
  // `saveAiMessage` (which commits the bubble into the chat) is triggered
  // exclusively by `finalizePlayback`, which itself fires at true end-of-
  // audio — so the chat-message transition is bound to audio end, not to
  // text-reveal completion.
  const startRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
    }
    revealTimerRef.current = setInterval(() => {
      const fullText = tokenBufferRef.current;
      if (fullText.length === 0) return;
      const firstPcmAt = firstPcmAtMsRef.current;
      let target = revealedCharsRef.current;

      // Reveal progress. Primary clock: AudioContext's scheduled timeline.
      // Fallback: wall-clock (used when the tracker context is suspended,
      // which happens post-fullscreen-exit / cold start — the exact failure
      // mode where "text appears only after Bina finishes speaking").
      const pbCtx = playbackTrackerCtxRef.current;
      // Put BOTH ends of the span on the AUDIBLE timeline using ONE delay lookup.
      // The silent mirror buffers are scheduled from chunk ARRIVAL, but the
      // speakers start `delay` later, so the real voice occupies
      // [mirrorStart + delay, mirrorEnd + delay]. Shifting only the start (the
      // original bug) leaves the span short by the whole delay, which made the
      // reveal finish ~2 s before Bina stopped speaking on every turn. Shifting
      // them with different values would reintroduce it — hence one `delaySec`.
      const delaySec = getAudibleDelayMs() / 1000;
      const rawStart = firstChunkStartCtxSecRef.current;
      const ctxStart = rawStart === null ? null : rawStart + delaySec;
      const ctxEnd = playbackScheduledEndAtRef.current + delaySec;
      const ctxAvailable =
        !!pbCtx &&
        pbCtx.state === "running" &&
        ctxStart !== null &&
        Number.isFinite(ctxEnd) &&
        ctxEnd > ctxStart;

      let progress: number | null = null;
      // Seconds of Bina's voice actually heard so far (negative before she is
      // audible). Phase A paces off this directly — no division, no inflation.
      let playedSec = 0;

      if (ctxAvailable) {
        const now = pbCtx!.currentTime;
        // Start the reveal REVEAL_LEAD_MS before the audio becomes audible so the
        // first words are already on screen as Bina starts speaking (fixes
        // "voice comes before text").
        if (now < ctxStart! - REVEAL_LEAD_MS / 1000) {
          if (REVEAL_DEBUG) console.debug(`[Reveal] ctx-wait now=${now.toFixed(3)} start=${ctxStart!.toFixed(3)}`);
          return;  // inside buffer delay
        }
        playedSec = now - ctxStart!;
        progress = (playedSec + REVEAL_LEAD_MS / 1000) / (ctxEnd - ctxStart!);
        if (REVEAL_DEBUG) console.debug(`[Reveal] ctx now=${now.toFixed(3)} start=${ctxStart!.toFixed(3)} end=${ctxEnd.toFixed(3)} delay=${(delaySec * 1000).toFixed(0)}ms played=${playedSec.toFixed(3)} prog=${progress.toFixed(3)}`);
      } else if (firstPcmAt !== null) {
        // Fallback: wall-clock math so streaming reveal works even when the
        // tracker AudioContext is stalled. `audibleStartMs` waits out the active
        // path's audible delay (0 on TalkingHead's Web Audio fallback); in
        // Phase B the denominator is the accumulated — and by then total —
        // audio duration.
        const audibleStartMs = firstPcmAt + getAudibleDelayMs();
        const elapsedMs = Date.now() - audibleStartMs + REVEAL_LEAD_MS;
        if (elapsedMs < 0) {
          if (REVEAL_DEBUG) console.debug(`[Reveal] wc-wait elapsed=${elapsedMs}`);
          return;
        }
        playedSec = (Date.now() - audibleStartMs) / 1000;
        const receivedMs = currentTurnAudioMsRef.current;
        if (receivedMs <= 0) return;
        progress = elapsedMs / receivedMs;
        if (REVEAL_DEBUG) console.debug(`[Reveal] wc elapsed=${elapsedMs} received=${receivedMs} prog=${progress.toFixed(3)} ctxState=${pbCtx?.state} ctxStart=${ctxStart}`);
      } else {
        if (REVEAL_DEBUG) console.debug(`[Reveal] no-anchor firstPcmAt=${firstPcmAt} ctxAvailable=${ctxAvailable}`);
        return;
      }

      if (progress === null) return;
      if (audioEndReceivedRef.current) {
        // ── Phase B: totals are final → fraction math is exact. With ctxEnd now
        // on the audible timeline the span equals the real audio duration, so
        // this lands REVEAL_LEAD_MS before the voice stops — no cap needed
        // beyond the natural 1.0.
        progress = Math.max(0, Math.min(1, progress));
        target = Math.floor(progress * fullText.length);
      } else {
        // ── Phase A: pace by RATE, not fraction. `progress` here divides by a
        // PARTIAL total and would inflate (see the header note), so it is only
        // logged, never used to position the text.
        const cps = measuredRevealCpsRef.current ?? DEFAULT_REVEAL_CPS;
        const paced = Math.floor(Math.max(0, playedSec + REVEAL_LEAD_MS / 1000) * cps);
        // Ceiling is a backstop against a bad CPS prior, not the pacer.
        target = Math.min(paced, Math.floor(fullText.length * PHASE_A_MAX_FRACTION));
        if (REVEAL_DEBUG) console.debug(`[Reveal] phaseA cps=${cps.toFixed(1)} paced=${paced} target=${target} len=${fullText.length} (unused prog=${progress.toFixed(3)})`);
      }
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
      //
      // Phase 1 perf (2026-05-28): cadence raised 80 ms → 200 ms. Reveal
      // pacing is anchored to the AudioContext clock (Phase B), not the
      // poll cadence — slowing the interval just makes the loop catch up
      // in larger character batches per tick. Visually imperceptible, but
      // drops the LiveAIBubble re-render rate from 12.5 Hz → 5 Hz, which
      // matters for low-end candidates running heavy MediaPipe proctoring
      // alongside Bina's speech.
    }, 200);
  }, []);

  const stopRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { stopRevealingTokens(); };
  }, [stopRevealingTokens]);

  // Web Speech API for real-time transcription
  // Accumulates ALL finalized segments + current interim so the user
  // sees their complete speech in the live transcript bubble.
  const webSpeechFinalizedRef = useRef("");

  const sendLiveTranscriptBatch = useCallback((text: string, trigger: string) => {
    // No-op: Browser Web Speech API removed; Whisper provides the final
    // transcript via the audio pipeline. live_transcript_batch is no longer
    // sent — backend now treats Whisper's output as the canonical source.
    void text;
    void trigger;
    return;
  }, []);

  const buildStableLiveTranscriptPreview = useCallback((incomingText: string) => {
    const next = incomingText.replace(/\s+/g, ' ').trim();
    // Only reject empty or pure-punctuation/symbol text. Do NOT run the full
    // isTranscriptMeaningful filter here — the accumulated live partial grows
    // to 200+ words over a long answer and looksRomanizedTamil false-positives
    // on English words (formula, Kerala, Australia) trigger after ~1 minute,
    // blanking the display and breaking the VAD silence timer.
    if (!next || ![...next].some(ch => /\p{L}|\p{N}/u.test(ch))) return "";
    // Keep the live bubble as close as possible to the raw provider/browser
    // transcript. The older prefix-stability logic avoided visible rewrites,
    // but it also dropped legitimate sentence updates when the recognizer
    // revised earlier words or emitted a shorter replacement segment.
    liveTranscriptDisplayRef.current = next;
    return next;
  }, []);

  const snapshotVisibleLiveTranscript = useCallback(() => {
    const visible = currentTranscriptRef.current.replace(/\s+/g, ' ').trim();
    if (visible) return visible;
    return webSpeechFinalizedRef.current.replace(/\s+/g, ' ').trim();
  }, []);

  // Idempotent "now listening" trigger for the "Your turn — speak now" popup.
  // Shows once the capture pipeline (mic + worklet) is live. (Batch models no
  // longer use the Web Speech API, and streaming models are backend-driven, so
  // pipeline-ready is the single gate for every provider.)
  const markListeningStarted = useCallback(() => {
    if (
      nowSpeakShownForSessionRef.current ||
      !isRecordingRef.current ||
      isAiSpeakingRef.current ||
      isProcessingRef.current ||
      isClosingRef.current ||
      !turnPipelineReadyRef.current
    ) {
      return;
    }
    nowSpeakShownForSessionRef.current = true;
    setShowNowSpeakBanner(true);
  }, []);

  const startWebSpeechRecognition = useCallback(() => {
    // Frontend-only live transcript for batch/final-only ASR models. This is
    // UI feedback only — the backend transcript still remains the canonical
    // answer for evaluation and final chat save.
    webSpeechFinalizedRef.current = "";
    webSpeechListeningRef.current = false;
    liveBatchSentCharsRef.current = 0;
    liveBatchIndexRef.current = 0;
    liveBatchStopRequestedRef.current = false;
    lastBrowserTranscriptTextRef.current = "";
    lastBrowserTranscriptUpdateAtRef.current = null;
    lastLiveTranscriptTextRef.current = "";
    lastLiveTranscriptUpdateAtRef.current = null;
    turnHasLiveTranscriptRef.current = false;
    liveTranscriptDisplayRef.current = "";
    setCurrentTranscript("");
    if (typeof window === 'undefined') return;
    const interviewWindow = window as InterviewWindow;
    const SpeechRecognition =
      interviewWindow.SpeechRecognition || interviewWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }
    setBrowserSpeechRecognitionSupported(true);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    // Engine has begun capturing mic audio → live transcription is truly live.
    // Surface the "Your turn — speak now" popup in sync with the listening bubble.
    // markListeningStarted is idempotent and also gated on the capture pipeline
    // being ready, so this can't show the banner prematurely.
    recognition.onaudiostart = () => {
      webSpeechListeningRef.current = true;
      markListeningStarted();
    };
    recognition.onresult = (event: BrowserSpeechRecognitionEventLike) => {
      // HARD GUARD: if Bina is currently speaking (or the post-playback echo
      // guard is still armed), whatever the Web Speech API picked up is almost
      // certainly Bina's own TTS bleeding back in through the speakers — NOT
      // the candidate. Drop those results entirely so they can't contaminate
      // the finalized buffer OR the live "speaking…" bubble. This is what was
      // showing "what strategies do you use to" (verbatim echo of Bina's
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
        const displayText = buildStableLiveTranscriptPreview(fullText);
        if (!displayText) {
          setCurrentTranscript("");
          currentTranscriptRef.current = "";
          return;
        }
        const nowMs = Date.now();
        const normalizedFullText = fullText.replace(/\s+/g, ' ').trim();
        if (normalizedFullText && normalizedFullText !== lastBrowserTranscriptTextRef.current) {
          lastBrowserTranscriptTextRef.current = normalizedFullText;
          lastBrowserTranscriptUpdateAtRef.current = nowMs;
          lastLiveTranscriptTextRef.current = normalizedFullText;
          lastLiveTranscriptUpdateAtRef.current = nowMs;
          turnHasLiveTranscriptRef.current = true;
          lastMeaningfulAudioAtRef.current = nowMs;
          if (!candidateAudioStreamingRef.current && !isAiSpeakingRef.current) {
            candidateAudioStreamingRef.current = true;
            candidateAudioFrameCountRef.current = MIN_POSSIBLE_SPEECH_FRAMES;
            flushPreSpeechAudioToBackend();
            console.log('[INTERVIEW-DEBUG] Browser transcript triggered early audio streaming');
          }
        }
        setCurrentTranscript(displayText);
        currentTranscriptRef.current = displayText;
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
          speechDetectedAtRef.current = nowMs;
          lastMeaningfulAudioAtRef.current = nowMs;
          speechPeakLevelRef.current = Math.max(speechPeakLevelRef.current, QUIET_SPEECH_ACTIVITY_LEVEL);
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
    // Track fatal errors (permission denied) that should suppress restart.
    // Local to this recognition instance — reset automatically when
    // startWebSpeechRecognition creates a fresh recognition object.
    let _fatalError = false;
    // Prevents a double-restart when both onerror(aborted) AND onend fire for
    // the same stop event (Safari behaviour — see onerror below).
    let _restartScheduled = false;

    // Arms a 55s preemptive-stop so we cleanly restart before Chrome/Edge's
    // 60s hard kill (or Safari's 15-30s kill). onend fires from the clean stop
    // → _scheduleRestart() → 150ms → recognition.start() → re-arm.
    const _armPreemptiveTimer = () => {
      if (webSpeechPreemptiveTimerRef.current !== null) {
        clearTimeout(webSpeechPreemptiveTimerRef.current);
      }
      webSpeechPreemptiveTimerRef.current = setTimeout(() => {
        webSpeechPreemptiveTimerRef.current = null;
        if (recognitionRef.current === recognition && isRecordingRef.current && !isAiSpeakingRef.current) {
          try { recognition.stop(); } catch {}
        }
      }, 55_000);
    };

    const _scheduleRestart = () => {
      if (_restartScheduled) return;          // already queued — don't double-fire
      _restartScheduled = true;
      // Clear any pending preemptive timer — the new session will re-arm it.
      if (webSpeechPreemptiveTimerRef.current !== null) {
        clearTimeout(webSpeechPreemptiveTimerRef.current);
        webSpeechPreemptiveTimerRef.current = null;
      }
      setTimeout(() => {
        _restartScheduled = false;
        if (
          recognitionRef.current !== recognition ||
          !isRecordingRef.current ||
          isAiSpeakingRef.current
        ) {
          return;
        }
        try {
          recognition.start();
          _armPreemptiveTimer();
        } catch {}
      }, 150);
    };

    // Counts not-allowed/service-not-allowed occurrences for this recognition instance.
    // Chrome fires service-not-allowed transiently on the very first Web Speech API
    // call in a session (service cold-start). One retry fixes Q1; a second occurrence
    // means genuine permission denial and we mark fatal.
    let _permissionErrorCount = 0;

    recognition.onerror = (event: { error: string }) => {
      const err = (event?.error || '');
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        _permissionErrorCount++;
        if (_permissionErrorCount === 1 && isRecordingRef.current && !isAiSpeakingRef.current) {
          // First occurrence may be transient (Chrome service cold-start on Q1).
          // Retry once with a longer delay so the service has time to initialize.
          console.warn('[WebSpeech] Permission/service error on first call — retrying once:', err);
          setTimeout(() => {
            if (recognitionRef.current === recognition && isRecordingRef.current && !isAiSpeakingRef.current) {
              try { recognition.start(); _armPreemptiveTimer(); } catch {}
            }
          }, 500);
        } else {
          // Second occurrence or not recording — genuine denial, stop retrying.
          _fatalError = true;
          console.warn('[WebSpeech] Permission denied — disabling browser recognition:', err);
        }
      } else {
        // aborted (Safari/iOS), no-speech, network, audio-capture — all transient.
        // _scheduleRestart() is idempotent: onend still fires on Chrome/Edge after
        // onerror, so the second call is a no-op. On Safari, onend may NOT fire
        // after these errors — so schedule here as a safety net for all browsers.
        if (!_fatalError && isRecordingRef.current && !isAiSpeakingRef.current) {
          _scheduleRestart();
        }
      }
    };

    recognition.onend = () => {
      // Only auto-restart if:
      //   • no fatal (permission) error
      //   • candidate mic is open
      //   • Bina is not speaking (avoids picking up her TTS)
      //   • past the post-Bina echo-guard window
      //   • this recognition object is still the active one (not replaced by
      //     stopWebSpeechRecognition/startWebSpeechRecognition)
      if (
        _fatalError ||
        !isRecordingRef.current ||
        isAiSpeakingRef.current ||
        Date.now() < playbackEchoGuardUntilRef.current
      ) {
        return;
      }
      // Delay restart by 150 ms so Chrome/Edge's engine fully tears down before
      // start() is called. Without this, start() throws InvalidStateError
      // synchronously inside onend — caught silently — and recognition never
      // resumes, causing the live transcript to freeze mid-speech for all
      // batch ASR providers (Gemini, Whisper, Sarvam, etc.).
      // _scheduleRestart() is idempotent: if onerror(aborted) already queued a
      // restart (Safari path), this is a no-op.
      _scheduleRestart();
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      _armPreemptiveTimer();
    } catch {}
  }, [buildStableLiveTranscriptPreview, flushPreSpeechAudioToBackend, sendLiveTranscriptBatch, isFlexibleMode, isNewFlexibleMode, markListeningStarted]);

  const stopWebSpeechRecognition = useCallback(() => {
    if (webSpeechPreemptiveTimerRef.current !== null) {
      clearTimeout(webSpeechPreemptiveTimerRef.current);
      webSpeechPreemptiveTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); recognitionRef.current = null; } catch {}
    }
    // Do NOT clear webSpeechFinalizedRef here — stopRecording() reads it for the
    // final flexible-mode batch send (line ~4413) and snapshotVisibleLiveTranscript()
    // falls back to it for browser_transcript. Clearing it here wipes speech captured
    // before a silence nudge restarts the recognizer, causing second-round speech to
    // be lost from browser_transcript. webSpeechFinalizedRef is reset in two places:
    //   • startWebSpeechRecognition() — new question, intentional fresh start
    //   • explicitly in the "Bina starts speaking" handler — clears stale display text
    liveTranscriptDisplayRef.current = "";
    lastBrowserTranscriptTextRef.current = "";
    lastBrowserTranscriptUpdateAtRef.current = null;
    lastLiveTranscriptTextRef.current = "";
    lastLiveTranscriptUpdateAtRef.current = null;
    turnHasLiveTranscriptRef.current = false;
  }, []);

  // Question number of the most recent provisional answer. Provisional chat
  // commits are disabled for English-only enforcement, but the transcript
  // handler still understands this ref for older in-flight sessions.
  const provisionalAnswerQnRef = useRef<number | null>(null);

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

  // ── Gapless scheduled audio playback ────────────────────────────────────────
  // Instead of onended → playNextBuffer (which has JS-event-loop gaps = clicks),
  // each buffer is scheduled on the Web Audio clock so it starts exactly where
  // the previous one ends.  pendingBuffersRef tracks how many have been scheduled
  // but not yet finished — when it hits 0 AND audioEndReceivedRef is true we know
  // playback is complete and it's time to start recording.

  const queueAudio = useCallback((pcmData: ArrayBuffer) => {
    // TalkingHead handles audio playback (gain:1) + lip sync.
    // Accumulate turn audio duration so the audio_end fallback timeout is
    // proportional to how long Bina actually spoke (not a fixed 3 s).
    // Int16 PCM @ 24 kHz: byteLength / 2 samples × (1000 ms / 24000 samples)
    currentTurnAudioMsRef.current += (pcmData.byteLength / 2 / 24000) * 1000;
    // Stamp the wall-clock of the most recent chunk — the TRUE anchor for
    // end-of-playback (buffered audio ends at lastPcmAt + tail margin).
    lastPcmAtMsRef.current = Date.now();

    if (!isPlayingRef.current) {
      // First chunk of this turn — stamp the wall-clock anchor (still used
      // by a few legacy code paths for timeouts). The authoritative audio-
      // clock anchor (firstChunkStartCtxSecRef) is stamped inside
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

  // WebSocket handlers
  const handleMessage = useCallback((data: InterviewSocketMessage) => {
    const timestamp = new Date().toISOString();
    console.log(`[WS ${timestamp}] Event: ${data.type}`, data);

    switch (data.type) {
      case "pong":
        console.log(`[WS ${timestamp}] Keepalive pong received`);
        break; // Keepalive response — no action needed
      case "concurrent_session_blocked":
        // The interview link is already open/active in another window/device.
        // Stop everything and show a terminal message — do NOT reconnect (the
        // server will just block again). The close (code 4409) follows this.
        console.warn(`[WS ${timestamp}] Concurrent session blocked by server`);
        // NOTE: do NOT set isClosingRef here — the onclose handler treats
        // isClosing as a NORMAL completion ("Interview completed"). The 4409
        // close branch + concurrentBlockedRef already suppress auto-reconnect.
        concurrentBlockedRef.current = true;
        setConcurrentBlocked(true);
        setStatus(typeof data.message === 'string' ? data.message : 'This interview is already open in another window or device.');
        try { stopRecordingSilentRef.current?.(); } catch { /* ignore */ }
        break;
      case "viseme_timeline":
        // Deprecated — lip sync is now driven by real-time amplitude analysis.
        console.log(`[WS ${timestamp}] Viseme timeline received (deprecated)`);
        break;
      case "connected":
        console.log(`[WS ${timestamp}] Connected: session_id=${data.session_id}, total_questions=${data.total_questions}, duration_minutes=${data.duration_minutes}, remaining_seconds=${data.remaining_seconds}`);
          setBackendLiveTranscriptEnabled(Boolean(data.live_transcript_enabled));
        {
          const isRealtime =
            Boolean(data.realtime_transcription_enabled) ||
            (typeof data.stt_model === "string" &&
              (data.stt_model.endsWith("-live") || data.stt_model === "gpt-realtime-whisper"));
          realtimeTranscriptionEnabledRef.current = isRealtime;
          setRealtimeTranscriptionEnabled(isRealtime);
        }
        serverEotEnabledRef.current = Boolean(data.server_side_eot_enabled);
        if (serverEotEnabledRef.current) {
          console.log(`[WS ${timestamp}] Server-side EndOfTurn ENABLED — client silence-cutoff disabled; waiting for server_end_turn`);
        }
        if (data.session_id) {
          sessionIdRef.current = data.session_id;
        }
        if (data.vad_config) {
          const serverThreshold = Number(data.vad_config.silence_threshold);
          const serverSilenceMs = Number(data.vad_config.silence_duration_ms);
          silenceThresholdRef.current = Number.isFinite(serverThreshold)
            ? Math.min(serverThreshold, MAX_CLIENT_SPEECH_THRESHOLD)
            : MAX_CLIENT_SPEECH_THRESHOLD;
          silenceDurationMsRef.current = Number.isFinite(serverSilenceMs)
            ? serverSilenceMs
            : silenceDurationMsRef.current;
          console.log(`[WS ${timestamp}] VAD config: server_threshold=${data.vad_config.silence_threshold}, effective_threshold=${silenceThresholdRef.current}, server_silence_ms=${data.vad_config.silence_duration_ms}, effective_silence_ms=${silenceDurationMsRef.current}`);
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
            priorMsgs.map((m, i) => ({
              id: `restored-${i}`,
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
        // Restore global timer ONLY if we're not currently mid-fullscreen-exit.
        if (data.elapsed_seconds && data.elapsed_seconds > 0) {
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
        // of questions Bina actually asked) instead of deriving it from
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
      case "environment_verification_triggered": {
        console.log(`[WS ${timestamp}] Environment verification triggered`);
        const _verificationUrl = typeof data.verification_url === 'string' ? data.verification_url : null;
        envVerificationResumedRef.current = false;
        setEnvVerification({
          qrCodeDataUri: typeof data.qr_code_data_uri === 'string' ? data.qr_code_data_uri : null,
          verificationUrl: _verificationUrl,
          expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
          challengeColor: typeof data.challenge_color === 'string' ? data.challenge_color : null,
          challengeId: typeof data.challenge_id === 'string' ? data.challenge_id : null,
          challengeRevealed: false,
          challengeColors: Array.isArray(data.challenge_colors) ? data.challenge_colors : null,
          recordingStartedAt: null,
          verificationToken: _verificationUrl ? _verificationUrl.split('/').filter(Boolean).pop() ?? null : null,
        });
        setStatus('Interview paused — verify your environment on your phone');
        break;
      }
      case "environment_verification_opened": {
        // Candidate's phone actually opened the verify link — reveal the
        // challenge color/ID on the laptop now, synced to this moment rather
        // than showing it from when the QR first appeared.
        console.log(`[WS ${timestamp}] Environment verification link opened on phone — revealing challenge`);
        setEnvVerification(prev => prev ? { ...prev, challengeRevealed: true } : prev);
        break;
      }
      case "environment_verification_recording_started": {
        // Phone confirmed MediaRecorder is actually recording — this is the
        // authoritative t=0 the 1-color-per-second cycle is keyed against.
        console.log(`[WS ${timestamp}] Environment verification recording started — beginning RGB cycle`);
        setEnvVerification(prev => prev ? {
          ...prev,
          challengeRevealed: true,
          recordingStartedAt: typeof data.recording_started_at === 'string' ? data.recording_started_at : null,
          challengeColors: Array.isArray(data.challenge_colors) ? data.challenge_colors : prev.challengeColors,
        } : prev);
        break;
      }
      case "environment_verification_submitted": {
        console.log(`[WS ${timestamp}] Environment verification submitted — resuming`);
        resumeEnvVerification();
        break;
      }
      case "greeting":
        console.log(`[WS ${timestamp}] Greeting received: text_length=${data.text?.length}`);
        // The FIRST question ("Tell me about yourself") and the reconnect resume
        // ack are delivered as a `greeting` (not the normal question stream), and
        // their question_timer_started arrives LATER (via on_speaking_done) — too
        // late to arm the pre-turn countdown before finalizePlayback opens the
        // mic. Arm it here so Q1 gets the 5→1 "get ready" countdown like every
        // other turn. (Nudges use interstitial_prompt, not greeting, so they
        // still correctly get NO countdown.)
        getReadyArmedRef.current = true;
        tokenBufferRef.current = data.text;
        revealedCharsRef.current = 0;
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        talkingHeadEndedEarlyRef.current = false;
        setStatus("Bina is speaking...");
        startRevealingTokens();
        // Feed text for word-level phoneme lip sync
        talkingHeadRef.current?.setText(data.text);
        break;
      case "interstitial_prompt":
        // Bina says a hardcoded line that bypasses the LLM (e.g. the silence
        // nudge "Are you there?"). Seed the token buffer so it:
        //   1) renders in the chat panel as an assistant message (saved on audio_end)
        //   2) is fed to TalkingHead for lip sync
        // PAUSE the per-question clock while she speaks the nudge — it resumes
        // when the candidate's turn reopens (mic start). (speaking_started from
        // this nudge's _speak also pauses; this is just the earliest point.)
        console.log(`[WS ${timestamp}] Interstitial prompt: kind=${data.kind}, text_length=${data.text?.length}`);
        pauseQuestionTimer();
        tokenBufferRef.current = (data.text as string) ?? "";
        revealedCharsRef.current = 0;
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        talkingHeadEndedEarlyRef.current = false;
        if (["silence_nudge", "silence_follow_up", "silence_move_on"].includes(String(data.kind || ""))) {
          isSilencePromptRef.current = true;
        }
        setStatus("Bina is speaking...");
        startRevealingTokens();
        talkingHeadRef.current?.setText((data.text as string) ?? "");
        break;
      case "role_intro":
        // Opening "About the role" warm-up. Stream + lip-sync it EXACTLY like a
        // normal Bina turn (progressive token reveal), so it looks identical to
        // every other message (previously it popped in as a STATIC bubble — the
        // reported "intro doesn't work like others"). The ONLY difference: it is
        // NOT a question — roleIntroActiveRef makes finalizePlayback COMMIT the
        // bubble (via saveAiMessage) but SKIP the mic-open AND the pre-turn
        // countdown for this message only.
        //
        // Streaming via the shared live bubble is safe NOW because the backend
        // defers the first question until THIS role message's playback_complete
        // (see send_greeting's deferral). So the role's finalizePlayback — which
        // runs saveAiMessage BEFORE the roleIntro early-return — always commits
        // the role bubble before Q1's tokens arrive. That closes the old race
        // that made the bubble vanish / delayed Q1's mic.
        // AII16 — the coaching tips are part of `data.text` itself (Bina speaks
        // the role summary + tips as ONE utterance), so they stream into this
        // bubble like any other message. Nothing extra to render.
        console.log(`[WS ${timestamp}] Role intro: text_length=${data.text?.length}`);
        roleIntroActiveRef.current = true;
        roleIntroTextRef.current = (data.text as string) ?? "";  // lip-sync fallback in speaking_started
        tokenBufferRef.current = (data.text as string) ?? "";     // STREAM it, like the greeting / questions
        revealedCharsRef.current = 0;
        currentAiTextRef.current = "";
        setCurrentAiText("");
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        talkingHeadEndedEarlyRef.current = false;
        setStatus("Bina is speaking...");
        startRevealingTokens();
        talkingHeadRef.current?.setText((data.text as string) ?? "");
        break;
      case "server_end_turn": {
        // Server-side EndOfTurn: the provider's neural turn detector decided the
        // candidate finished. Stop recording now (which sends the normal end_turn,
        // reusing the whole existing pipeline). Only act while actually recording
        // and not during Bina's speech, so a stray signal can't misfire.
        if (isRecordingRef.current && !isAiSpeakingRef.current) {
          console.log(`[WS ${timestamp}] server_end_turn → stopRecording`);
          stopRecording();
        }
        break;
      }
      case "live_transcript": {
        // Any backend live-transcript provider can stream interim text while
        // the candidate speaks. Drive the live "You" bubble directly from
        // these partials. The final canonical transcript still arrives via the
        // "transcript" (is_final) message, which clears this bubble and
        // commits the chat message.
        const liveText = (data.text ?? "").trim();
        // Echo guard: ignore partials that arrive while Bina is talking or
        // during the post-playback echo window — those are her TTS bleeding
        // back through the mic, not the candidate.
        if (isAiSpeakingRef.current) break;
        if (Date.now() < playbackEchoGuardUntilRef.current) break;
        // Only show the live "speaking…" bubble while the candidate is ACTUALLY
        // recording an answer. After end_turn (isRecording=false) the Deepgram
        // stream re-emits the just-finished answer's final transcript one more
        // time — without this guard it reappeared as a live bubble even though
        // the answer was already committed as a "You" message (the duplicate).
        if (!isRecordingRef.current) break;
        if (liveText.length > 0) {
          // For live partials, only check that the text has at least one real
          // character — don't run the full hallucination/Tamil filter here.
          // The full filter operates on complete Whisper batch output (short
          // clips). Live partials are accumulated turn text (grows to 200+ words
          // over a 1-minute answer) — running looksRomanizedTamil on long English
          // answers causes false positives that clear the display and break the
          // VAD silence timer, stopping the transcript after ~1 minute.
          const meaningfulLiveText = [...liveText].some(ch => /\p{L}|\p{N}/u.test(ch));
          if (meaningfulLiveText) {
            const nowMs = Date.now();
            const normalizedLiveText = liveText.replace(/\s+/g, ' ').trim();
            if (normalizedLiveText && normalizedLiveText !== lastLiveTranscriptTextRef.current) {
              lastLiveTranscriptTextRef.current = normalizedLiveText;
              lastLiveTranscriptUpdateAtRef.current = nowMs;
              turnHasLiveTranscriptRef.current = true;
              lastMeaningfulAudioAtRef.current = nowMs;
            }
            const displayText = buildStableLiveTranscriptPreview(liveText);
            setCurrentTranscript(displayText);
            currentTranscriptRef.current = displayText;
          } else {
            setCurrentTranscript("");
            currentTranscriptRef.current = "";
          }
          // Bridge to VAD: real speech detected — mark speechDetected so the
          // "Are you there?" no-response timer doesn't fire mid-answer.
          if (meaningfulLiveText && !speechDetectedRef.current) {
            speechDetectedRef.current = true;
            const nowMs = Date.now();
            speechDetectedAtRef.current = nowMs;
            lastMeaningfulAudioAtRef.current = nowMs;
            speechPeakLevelRef.current = Math.max(speechPeakLevelRef.current, QUIET_SPEECH_ACTIVITY_LEVEL);
            questionTimerAwaitingSpeechRef.current = false;
            if (!speechStartSentRef.current) {
              speechStartSentRef.current = true;
              try { wsRef.current?.send(JSON.stringify({ type: 'speech_started' })); } catch {}
            }
          }
        }
        break;
      }
      case "transcript":
        console.log('[INTERVIEW-DEBUG] transcript received from Whisper', {
          is_final: data.is_final,
          text_length: data.text?.length ?? 0,
          text_preview: (data.text ?? '').slice(0, 80),
          is_enhanced: data.is_enhanced,
        });
        console.log(`[WS ${timestamp}] Transcript: is_final=${data.is_final}, text_length=${data.text?.length}, is_enhanced=${data.is_enhanced}`);
        if (data.is_final) {
          const transcriptText = (data.text ?? "").trim();
          // Validate: reject empty text, noise artifacts, and Whisper hallucinations.
          if (transcriptText && isTranscriptMeaningful(transcriptText)) {
            // Clear live bubble only now — it atomically transitions to a chat message.
            // Never clear before this point: keeps transcript visible during processing gap.
            setCurrentTranscript("");
            currentTranscriptRef.current = "";
            liveTranscriptDisplayRef.current = "";
            setIsCandidateTranscriptProcessing(false);
            // The candidate actually spoke this turn (a real transcript landed),
            // so drop any "Let's move on…" skip chip we optimistically posted on
            // a Next click — the transcript IS the record; the chip on top of it
            // would be redundant/confusing.
            if (skipChipIdRef.current) {
              const _chipId = skipChipIdRef.current;
              skipChipIdRef.current = null;
              setMessages(prev => prev.filter(m => m.id !== _chipId));
            }
            // End-while-answering: the candidate clicked End mid-answer; we held
            // the close until their answer was transcribed. It's committed now —
            // send end_interview so Bina's farewell starts AFTER their answer
            // bubble is on screen (not before).
            if (pendingEndAfterTranscriptRef.current) {
              pendingEndAfterTranscriptRef.current = false;
              setStatus("Ending interview…");
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'end_interview' }));
              }
            }
            // The decoupled/background flow tags late transcripts with the
            // question they answered. `qn` is that number (or null for the
            // synchronous flow, where the answer is always the most recent one).
            const qn: number | null =
              data.for_previous_question && typeof data.question_number === "number"
                ? data.question_number
                : null;
            if (data.is_enhanced) {
              // SHOW-CORRECTED-IN-CHAT (2026-06-10): replace the raw answer
              // bubble with the context-aware enhanced transcript — the SAME
              // text used for scoring + the Question Analysis report. (Supersedes
              // the earlier RAW-IN-CHAT policy.) The enhancer's guards
              // (length/overlap rejection in transcript_enhancer.py) + the
              // deterministic pre-pass keep substitutions in check; if it ever
              // shows a wrong word, the raw is still in the backend logs.
              // Upgrade the existing bubble IN PLACE — never add a duplicate.
              setMessages(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (
                    updated[i].role === "user" &&
                    !updated[i].isActionRequest &&
                    (qn == null || updated[i].questionNumber === qn)
                  ) {
                    if (updated[i].content !== transcriptText) {
                      updated[i] = { ...updated[i], content: transcriptText };
                    }
                    return updated;
                  }
                }
                // No raw bubble yet (enhanced arrived first) — add it.
                updated.push({
                  id: crypto.randomUUID(),
                  role: "user",
                  content: transcriptText,
                  timestamp: nowIST(),
                  questionNumber: qn ?? undefined,
                });
                return updated;
              });
            } else {
              // Raw Whisper transcript — add as new user message, stamping the
              // frozen timer value captured when the candidate stopped speaking.
              const frozenTime = frozenResponseTimeRef.current;
              frozenResponseTimeRef.current = null; // consume — don't reuse for next message
              const _userMsg: Message = {
                id: crypto.randomUUID(),
                role: "user",
                content: transcriptText,
                responseTimeSeconds: frozenTime ?? undefined,
                timestamp: nowIST(),
                questionNumber: qn ?? undefined,
              };
              // targetQn is the question this Whisper text belongs to: qn for
              // the decoupled flow, else an older in-flight provisional answer's
              // question number.
              const provQn = provisionalAnswerQnRef.current;
              const targetQn = qn !== null ? qn : provQn;
              setMessages(prev => {
                const updated = [...prev];
                // ── CLARIFICATION: always a DISTINCT bubble ───────────────
                // During a clarification, this transcript event is the SOLE add.
                // Append each clarify utterance as its own bubble under the CURRENT
                // question — never upgrade/collapse onto a prior same-question
                // bubble. That keeps BOTH the 1st and 2nd clarify visible even
                // when the candidate repeats the IDENTICAL phrase ("Please
                // clarify the question." twice). isClarification is only true
                // from Bina's repeat onward, so the 1st clarify still flows
                // through the normal provisional→upgrade path below.
                if (isClarificationRef.current) {
                  updated.push({
                    ..._userMsg,
                    questionNumber: questionNumberRef.current ?? _userMsg.questionNumber,
                  });
                  return updated;
                }
                // ── DEDUP GUARD (2026-05-26) ──────────────────────────────
                // A long-answer pipeline hang/timeout (run_pipeline HARD
                // TIMEOUT at 180s, or leftover audio bleeding into the next
                // turn's ASR) can re-fire the SAME transcript against the NEXT
                // slot, so a Q1 answer reappears under Q2 (session e2509090).
                // Drop a final transcript whose normalized text already exists
                // under a DIFFERENT question. Scoped to >= 8 words so a
                // candidate legitimately repeating a SHORT answer ("I don't
                // know", "yes") still renders under each question. The
                // same-question bubble is exempt (questionNumber === targetQn)
                // so the provisional→final upgrade in step 1 still works.
                const _normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
                const _normNew = _normalize(transcriptText);
                if (_normNew.split(' ').filter(Boolean).length >= 8) {
                  const _dupElsewhere = updated.some(m =>
                    m.role === "user" &&
                    (targetQn == null || m.questionNumber !== targetQn) &&
                    _normalize(m.content) === _normNew
                  );
                  if (_dupElsewhere) {
                    console.warn('[Transcript] Dropping duplicate answer already shown for another question (long-answer re-fire guard)');
                    return prev;
                  }
                }
                // 1. Upgrade the existing answer bubble for this question (the
                //    provisional live transcript) in place — no duplicate.
                if (targetQn != null) {
                  for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].role === "user" && !updated[i].isActionRequest && updated[i].questionNumber === targetQn) {
                      updated[i] = { ...updated[i], content: transcriptText };
                      return updated;
                    }
                  }
                }
                // 2. Decoupled flow with no provisional bubble: insert right
                //    after the matching question bubble (fallback: before the
                //    most recent assistant message) so ordering stays sane.
                if (data.for_previous_question) {
                  let insertAt = -1;
                  if (qn !== null) {
                    for (let i = 0; i < updated.length; i++) {
                      if (updated[i].role === "assistant" && updated[i].questionNumber === qn) {
                        insertAt = i + 1;
                        while (
                          insertAt < updated.length &&
                          updated[insertAt].role === "user" &&
                          !updated[insertAt].isActionRequest &&
                          updated[insertAt].questionNumber === qn
                        ) {
                          insertAt++;
                        }
                        break;
                      }
                    }
                  }
                  if (insertAt === -1) {
                    insertAt = updated.length;
                    for (let i = updated.length - 1; i >= 0; i--) {
                      if (updated[i].role === "assistant") { insertAt = i; break; }
                    }
                  }
                  updated.splice(insertAt, 0, _userMsg);
                  return updated;
                }
                // 3. Synchronous flow — append at the bottom.
                updated.push(_userMsg);
                return updated;
              });
              // Provisional has been reconciled with the real transcript.
              if (provQn != null) provisionalAnswerQnRef.current = null;
            }
            currentAiTextRef.current = "";
            setCurrentAiText("");
          }
          // If transcript is empty or fails validation, do not show it. The backend
          // will send silent_discard for rejected/off-language speech.
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
      case "question_meta":
        // Backend signals that the upcoming question is a follow-up (bundles
        // a previously-volunteered skill, or fires as an in-slot validation
        // turn). The flag is tracked so it gets stamped onto the saved
        // Message (for transcript/eval round-trip), but the LIVE CHAT does
        // NOT render any chip or inline note — the Follow-up indicator and
        // "Reframed as a follow-up…" note are post-interview-only and live
        // on the Question Analysis (EvaluationDashboardV2) page.
        console.log(`[WS ${timestamp}] question_meta: is_followup=${data.is_followup}, skills=${JSON.stringify(data.follow_skills)}`);
        if (data.is_followup) {
          isCurrentFollowupRef.current = true;
        } else {
          isCurrentFollowupRef.current = false;
        }
        break;
      case "llm_token":
        console.log(`[WS ${timestamp}] LLM token: token_length=${data.token?.length}, buffer_length=${tokenBufferRef.current.length}`);
        tokenBufferRef.current += data.token;
        // Feed updated text for word-level phoneme lip sync
        talkingHeadRef.current?.setText(tokenBufferRef.current);
        // Mark Bina as speaking the moment she starts *generating* text.
        // Without this, there's a 1-3s gap between the last LLM token and
        // `speaking_started` (TTS synthesis latency) during which
        // isAiSpeaking flips false → the "Your turn — speak now" banner
        // flashes before Bina's voice actually begins. Holding this true
        // from first-token closes that window.
        if (!isAiSpeakingRef.current) {
          isAiSpeakingRef.current = true;
          setIsAiSpeaking(true);
          audioEndReceivedRef.current = false;
          // Reset the early-end recovery flag for this new turn (the previous
          // turn's mid-sentence-cutoff recovery shouldn't carry over).
          talkingHeadEndedEarlyRef.current = false;
          candidatePlaybackEndedRef.current = false;
          setCandidatePlaybackEnded(false);
          // Reset turn-scoped audio anchors so Fix 2's reveal gate works for
          // THIS turn. Without this, `firstPcmAtMsRef` stays set from the
          // previous question's audio — Phase A sees it as non-null, runs
          // immediately with CPS pacing, and Q2+ text races ahead of Bina's
          // voice while Q1 correctly waits.
          firstPcmAtMsRef.current = null;
          lastPcmAtMsRef.current = null;
          currentTurnAudioMsRef.current = 0;
          firstChunkStartCtxSecRef.current = null;
        }
        if (!revealTimerRef.current) {
          startRevealingTokens();
        }
        if (!isPlayingRef.current) {
          setStatus("Bina is thinking...");
        }
        break;
      case "tts_failed":
        // TTS produced no audio even after a backend retry. Per the sync
        // requirement, do NOT leave silent question text on screen — SUPPRESS it:
        // clear the live token buffer so nothing is revealed and saveAiMessage()
        // on finalize commits no bubble. The audio_end that follows still opens
        // the mic; the backend's silence ladder handles the (rare) blank turn.
        console.warn(`[WS ${timestamp}] tts_failed — suppressing silent question text`);
        if (revealTimerRef.current) { clearInterval(revealTimerRef.current); revealTimerRef.current = null; }
        tokenBufferRef.current = "";
        currentAiTextRef.current = "";
        revealedCharsRef.current = 0;
        setCurrentAiText("");
        break;
      case "llm_correction":
        // Backend replaced the streamed response (validation retry/fallback OR a
        // post-processed skip-path question). Swap the token buffer so the
        // displayed text matches what Bina actually says.
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
        // Bina is speaking again — abort any in-progress pre-turn "get ready"
        // countdown and any pending mic-open timer (they belong to a turn that
        // is no longer opening) + the mid-speech silence countdown.
        cancelPreTurnCountdownRef.current();
        if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }
        setMidSilenceCountdown_(null);
        // Bina is speaking (question / repeat / prompt) — PAUSE the per-question
        // answer clock. It resumes when the candidate's turn reopens (mic start).
        // For a brand-new question the pause is harmless — the incoming
        // question_timer_started resets the clock fresh.
        pauseQuestionTimer();
        // Any pending candidate-processing bubble belongs to the PREVIOUS turn.
        // Once Bina takes over, that turn is resolved (accepted, discarded, or
        // skipped) and the stale loader must not remain on screen.
        setIsCandidateTranscriptProcessing(false);
        setCurrentTranscript("");
        currentTranscriptRef.current = "";
        provisionalAnswerQnRef.current = null;
        // Stop any stale recording or pending start-recording timer — Bina is speaking.
        stopRecordingSilentRef.current();
        if (startRecordingTimerRef.current) {
          clearTimeout(startRecordingTimerRef.current);
          startRecordingTimerRef.current = null;
        }
        // Belt-and-suspenders: hard-disable the mic audio track while Bina
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
        // immediately stream PCM (including Bina's echo) to the backend.
        speechDetectedRef.current = false;
        speechFrameCountRef.current = 0;
        speechStartSentRef.current = false;
        silenceStartRef.current = null;
        lastMeaningfulAudioAtRef.current = null;
    lastStrongVoiceAtRef.current = null;
    activeStreakStartRef.current = null;
    lastActiveFrameAtRef.current = null;
        speechPeakLevelRef.current = 0;
        ambientNoiseFloorRef.current = POSSIBLE_SPEECH_LEVEL * 0.5;
        // ALSO hard-stop the browser Web Speech API recognition AND clear any
        // stale live-transcript text. If we leave it running while Bina
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
        // Fix (question-skip bug): cancel any STALE playback timers left over
        // from the previous turn. `audio_end` arms playbackCompleteSignalRef +
        // audioEndFallbackRef on wall-clock delays; if the prior turn ended via
        // a path that didn't clear them, a stale timer could fire DURING this
        // new generation and send a premature `playback_complete`, making the
        // backend think Bina finished → it advances/skips this question.
        if (playbackCompleteSignalRef.current) { clearTimeout(playbackCompleteSignalRef.current); playbackCompleteSignalRef.current = null; }
        if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
        // Bug C fix: new Bina turn starting — retract the "candidate can
        // speak" signal immediately so the banner can't linger from Q(n-1).
        candidatePlaybackEndedRef.current = false;
        setCandidatePlaybackEnded(false);
        // CRITICAL: reset ALL playback-tracking state so the new Bina turn
        // starts from a clean slate. Previously `isPlayingRef` was NOT reset
        // here; if it was stale `true` from a previous turn (TalkingHead
        // onAudioEnd never fired correctly), `queueAudio` would skip setting
        // `firstPcmAtMsRef`, the `finalizePlayback` deferral math would use
        // the stale anchor, compute `remainingPlaybackMs = 0`, and fire
        // immediately — surfacing "Your turn" while Bina was still speaking
        // the "Are you there?" prompt.
        isPlayingRef.current = false;
        pendingBuffersRef.current = 0;
        nextPlayTimeRef.current = 0;
        // Only reset the no-response retry counter for genuine NEW turns
        // (Bina asking a new question, ack, follow-up). During silence-nudge
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
        firstChunkStartCtxSecRef.current = null; // reset audio-clock anchor for this turn
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
        // Clear silence banner + countdown when Bina starts speaking
        setShowSilenceBanner(false);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        // Clear the "Your turn — speak now" banner IMMEDIATELY so it never lingers
        // visibly while Bina speaks (follow-ups, next questions, clarifications).
        setShowNowSpeakBanner(false);
        nowSpeakShownForSessionRef.current = false; // allow a fresh banner after she finishes
        setStatus("Bina is speaking...");
        startRevealingTokens();
        // Clear stale expired timer when Bina starts speaking the NEXT question
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
        // Feed accumulated text for phoneme lip sync before starting audio.
        // The role intro now streams like any other turn (tokenBufferRef holds
        // its text), so this normally uses tokenBufferRef. The roleIntroTextRef
        // fallback is kept as a belt-and-suspenders in case speaking_started
        // races ahead of the role_intro message (else TalkingHead would get ""
        // and Bina's mouth would stay still — the "audio plays, Bina silent" bug).
        talkingHeadRef.current?.setText(
          tokenBufferRef.current || (roleIntroActiveRef.current ? roleIntroTextRef.current : "")
        );
        // Defer streamStart until the first PCM chunk arrives (see pendingStreamStartRef).
        // Calling streamStart here (empty buffer) can cause TalkingHead to fire onAudioEnd
        // immediately on Q1 when AudioContext is cold, clearing isAiSpeaking mid-speech.
        pendingStreamStartRef.current = () => {
          console.log("[TalkingHead] playback-ended callback — audio_end received?", audioEndReceivedRef.current);
          // GUARD: TalkingHead's onAudioEnd callback can fire too early —
          // e.g. on a brief silence between PCM chunks, or when its internal
          // queue drains before the backend has actually finished streaming
          // TTS audio. For Q2+ this was surfacing the "Your turn" banner
          // and starting the per-question timer while Bina was still
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
            // Arm the re-start flag so the next PCM chunk wakes the worklet
            // back up. Without this, mid-sentence buffer drains cause the
            // remaining audio to stream into a stopped worklet and be lost
            // (Bina's voice cuts off mid-sentence).
            talkingHeadEndedEarlyRef.current = true;
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
            // from the backend before Bina's farewell finished playing.
            if (pendingCompletionModalRef.current) {
              pendingCompletionModalRef.current = false;
              setShowCompletionModal(true);
            }
            // Fix 3: arm echo guard — VAD ignores speech input for
            // PLAYBACK_ECHO_GUARD_MS after Bina's real end-of-playback so TTS
            // tail / reverb can't register as candidate speech.
            playbackEchoGuardUntilRef.current = Date.now() + PLAYBACK_ECHO_GUARD_MS;
            saveAiMessage();
            // Notify backend: audio finished playing — start silence clock from now.
            // Sent twice via sendPlaybackComplete to survive a single dropped frame.
            sendPlaybackComplete();
            // Disconnect if interview is closing (Q15 done) or server sent interview_ended
            if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
              setStatus("Interview completed. Thank you!");
              setTimeout(() => { disconnectRef.current(); }, 1500);
              return;
            }
            // Role-intro warm-up: this message is NOT a question — do NOT open
            // the mic. The 'tell me about yourself' question follows immediately
            // (its own speaking_started/greeting arms the mic). Committing the
            // bubble (saveAiMessage above) + state cleanup already happened; just
            // skip the mic-open and clear the flag.
            if (roleIntroActiveRef.current) {
              roleIntroActiveRef.current = false;
              setStatus("Bina is speaking...");
              return;
            }
            // Point 4: clarification ends the moment Bina finishes speaking
            setIsClarification(false);
            isClarificationRef.current = false;
            // Run the 5→1 "get ready" countdown ONLY for a real question turn
            // (armed by question_timer_started). After a silence nudge ("Are you
            // there?") there's no new timer, so we skip the countdown and reopen
            // the mic immediately. Consume the arm flag either way.
            const _runGetReady = getReadyArmedRef.current;
            getReadyArmedRef.current = false;
            const _openMic = () => {
              setStatus("Your turn - speak now...");
              if (wsRef.current?.readyState === WebSocket.OPEN
                  && !isAiSpeakingRef.current
                  && !isRecordingRef.current) {
                startRecordingInternalRef.current();
              }
            };
            setStatus(_runGetReady ? "Get ready…" : "Your turn - speak now...");
            // 800ms echo-decay delay (lets Bina's TTS tail fade so Whisper doesn't
            // transcribe it), THEN — for a real turn — the 5→1 "get ready"
            // countdown (Change 1). ONLY when it reaches 0 do we open the mic +
            // start the answer timer. Mic + per-question timer stay OFF during it.
            if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
            startRecordingTimerRef.current = setTimeout(() => {
              startRecordingTimerRef.current = null;
              if (wsRef.current?.readyState !== WebSocket.OPEN) return;
              if (isAiSpeakingRef.current || isRecordingRef.current) return; // turn changed
              if (_runGetReady) {
                runPreTurnCountdownRef.current(_openMic);
              } else {
                _openMic();
              }
            }, 800);
          };
          // Wait for the tracker's audio-clock-end-of-playback BEFORE running
          // the end-of-turn work. If audio has already drained (tracker
          // pending=0 and ctx.currentTime >= scheduledEnd), this fires
          // synchronously. Otherwise it queues on the last chunk's `onended`.
          // Safety timeout is AUDIO-DURATION-BASED (not the fixed 20s default):
          // when the AudioContext tracker stalls (observed with some providers /
          // suspended-ctx environments), the old 20s default left the mic /
          // "Your turn" stuck ~20-30s after the question. Basing it on the
          // received audio duration + tail fires finalizePlayback right after
          // the audio should have ended, so the turn opens on time.
          const _finalizeSafetyMs = Math.max(4000, currentTurnAudioMsRef.current + 2500);
          whenTrackedPlaybackEnds(finalizePlayback, _finalizeSafetyMs);
        };
        break;
      case "silent_discard":
        // If the candidate clicked End mid-answer but the answer was discarded
        // (noise / non-English), there's no bubble to wait for — end now instead
        // of stalling until the 12s safety net.
        if (pendingEndAfterTranscriptRef.current) {
          pendingEndAfterTranscriptRef.current = false;
          setStatus("Ending interview…");
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'end_interview' }));
          }
        }
        // Backend silently discarded the transcript (noise, non-English, hallucination).
        // Clear processing and reopen mic. Resume the per-question timer (it was
        // paused by question_timer_stopped on end_turn — since the response was
        // discarded, the candidate is still on the same question and the answer
        // window should keep ticking down from where it froze).
        setIsProcessing(false);
        isProcessingRef.current = false;
        setIsCandidateTranscriptProcessing(false);
        setCurrentTranscript("");
        currentTranscriptRef.current = "";
        provisionalAnswerQnRef.current = null;
        // Read the frozen value from state — stopRecording nulls the REF to
        // prevent double-deduction of the global timer, but leaves React state
        // intact so the banner stays visible. Without falling back to state
        // here, the ref-null causes silent_discard's resume to no-op and the
        // candidate's answer window appears stuck at the frozen value forever.
        setQuestionTimerSeconds(prevSeconds => {
          if (
            prevSeconds !== null
            && prevSeconds > 0
            && !questionTimerExpiredRef.current
            && questionTimerIntervalRef.current === null
          ) {
            // Re-sync ref so subsequent reads (heartbeat watchdog, tick interval)
            // see the correct value, then resume the countdown from the freeze
            // point — original anchor's pause accounting was torn down at
            // question_timer_stopped.
            questionTimerSecondsRef.current = prevSeconds;
            ensureQuestionTimerRunning(prevSeconds);
          }
          return prevSeconds;
        });
        if (!isAiSpeakingRef.current && !isRecordingRef.current && !isFaceBlockedRef.current && !isMutedRef.current) {
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && !isAiSpeakingRef.current) {
              startRecordingInternalRef.current();
            }
          }, 300);
        }
        break;
      case "transcript_discarded":
        // Background timed-mode transcript was rejected after the backend had
        // already advanced to the next question. Clear only the candidate-side
        // validation UI; do not reopen the mic or alter timers here.
        setIsCandidateTranscriptProcessing(false);
        setCurrentTranscript("");
        currentTranscriptRef.current = "";
        provisionalAnswerQnRef.current = null;
        frozenResponseTimeRef.current = null;
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
              startRecordingInternalRef.current();
            }
          }, 800);
        }
        break;
      case "interrupted":
        // Backend cancelled current generation (e.g. skip_question during answer).
        // Stop any playing audio immediately and clear ALL state so the next
        // pipeline (skip question) starts from a clean slate.
        cancelPreTurnCountdownRef.current();
        if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }
        setMidSilenceCountdown_(null);
        talkingHeadRef.current?.streamStop();
        isPlayingRef.current = false;
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        setIsProcessing(false);
        isProcessingRef.current = false;
        setIsCandidateTranscriptProcessing(false);
        setCurrentTranscript("");
        currentTranscriptRef.current = "";
        provisionalAnswerQnRef.current = null;
        avatarState.onAiStopSpeaking();
        pendingBuffersRef.current = 0;
        audioEndReceivedRef.current = false;
        if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
        // Fix #1: cancel the dedicated playback_complete signal — this turn's
        // generation was interrupted, so its stale wall-clock signal must not
        // fire during the next turn.
        if (playbackCompleteSignalRef.current) { clearTimeout(playbackCompleteSignalRef.current); playbackCompleteSignalRef.current = null; }
        if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }
        stopRecordingSilentRef.current();
        // Pause the per-question timer — do NOT null the displayed value.
        // Backend sends `interrupted` for skip-triggered events (verbal IDK,
        // silence auto-skip, Next Q). Those are always followed by a fresh
        // `question_timer_started` that resets the value correctly. Nulling
        // here made the timer vanish mid-answer when the candidate said
        // "I don't know" (backend fires interrupted → frontend nulled →
        // user observed "timer gone" even though nothing was actually wrong).
        // Freezing the display keeps it visible across the brief gap until
        // the next question's timer arrives and resets it.
        if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
        questionTimerPendingRef.current = null;
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
        // Using a fixed 3 s caused the fallback to fire MID-SPEECH for any Bina
        // response longer than ~2 s, opening the mic while she was still talking.
        const _fallbackDelayMs = Math.max(4000, currentTurnAudioMsRef.current + 2500);

        // ── Fix #1: avatar-decoupled playback_complete delivery ────────────
        // Fire ONLY the backend signal on a clean wall-clock timer based on the
        // known audio duration. No avatar/tracker dependency, no isRecording
        // guard, no bundled side-effects — so the backend's silence clock
        // always starts on time even when TalkingHead never loads. Conservative
        // delay (audioMs + 1200ms) so it never fires BEFORE the audio actually
        // finishes (which would start the silence clock early and shorten the
        // candidate's answer window). Idempotent on the backend.
        if (playbackCompleteSignalRef.current) clearTimeout(playbackCompleteSignalRef.current);
        const _signalDelayMs = Math.max(2000, currentTurnAudioMsRef.current + 1200);
        playbackCompleteSignalRef.current = setTimeout(() => {
          playbackCompleteSignalRef.current = null;
          sendPlaybackComplete();
        }, _signalDelayMs);

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
              setTimeout(() => { disconnectRef.current(); }, 1500);
              return;
            }
            console.warn("[Safety-net] TalkingHead onAudioEnd never fired — starting mic manually");
            // Point 4: clarification ends when Bina stops speaking
            setIsClarification(false);
            isClarificationRef.current = false;
            setStatus("Your turn - speak now...");
            if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
            startRecordingTimerRef.current = setTimeout(() => {
              startRecordingTimerRef.current = null;
              startRecordingInternalRef.current();
            }, 800);
          }
        }, _fallbackDelayMs);
        break;
      }
      case "processing":
        setIsProcessing(true);
        // Candidate responded — clear silence banner and its auto-skip countdown
        setShowSilenceBanner(false);
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
      case "repeat_pending": {
        // ── VOICE repeat/clarification — PROACTIVE freeze (mirrors the button) ──
        // The backend detected that the candidate asked (by voice) to repeat/
        // clarify the question, and sends this BEFORE it re-speaks. We arm the
        // exact same freeze the Repeat BUTTON arms at click time — proactively,
        // ahead of the re-speak's question_timer_started — so the answer clock
        // freezes at the value the candidate had when they asked and RESUMES
        // there on "Your turn".
        //
        // Why not rely on question_timer_started.is_clarification alone: that
        // flag comes from the ws.py clarification gate, which can fall through
        // to the follow-up/main path and send is_clarification=false — in which
        // case a reactive frontend check never fires and the timer resets/ticks
        // (the bug that persisted). This signal is emitted straight from the
        // clarification DETECTION, so it does not depend on that flag.
        //
        // frozenResponseTimeRef holds the per-question remaining captured in
        // stopRecording() the moment the candidate finished their repeat-request
        // turn (questionTimerSecondsRef was nulled by the answer submit).
        if (!repeatFreezeRef.current) {
          const _rpResume =
            (frozenResponseTimeRef.current != null && frozenResponseTimeRef.current > 0)
              ? frozenResponseTimeRef.current
              : (questionTimerSecondsRef.current != null && questionTimerSecondsRef.current > 0)
                ? questionTimerSecondsRef.current
                : null;
          if (_rpResume != null) {
            repeatFreezeRef.current = true;
            repeatFrozenRemainingRef.current = _rpResume;
            // One repeat per turn — mirror the button so the resume doesn't
            // re-arm the repeat window (backend auto-advances on the 2nd ask).
            repeatUsedThisTurnRef.current = true;
            // Park the display at the frozen value now (during processing / the
            // re-speak) so it doesn't show a stale/blank or a fresh 2:00.
            if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
            setQuestionTimerSeconds(_rpResume);
            questionTimerSecondsRef.current = _rpResume;
            setQuestionTimerExpired(false);
            questionTimerExpiredRef.current = false;
            console.log(`[Timer ${timestamp}] repeat_pending — PROACTIVELY froze answer clock at ${_rpResume}s (voice repeat, mirrors Repeat button); resumes on "Your turn"`);
          } else {
            console.log(`[Timer ${timestamp}] repeat_pending received but no frozen remaining available — will fall back to is_clarification handling`);
          }
        }
        break;
      }
      case "question_timer_started": {
        // A real question turn is about to open (main / follow-up / clarification
        // / repeat) — arm the pre-turn "get ready" 5→1 countdown. Consumed by
        // finalizePlayback when the mic is about to open. Nudges never send this.
        getReadyArmedRef.current = true;
        console.log('[INTERVIEW-DEBUG] question_timer_started received', {
          seconds: data.seconds,
          total_seconds: data.total_seconds,
          question_number: data.question_number,
          is_follow_up: data.is_follow_up,
          is_clarification: data.is_clarification,
          isAiSpeaking: isAiSpeakingRef.current,
          isRecording: isRecordingRef.current,
          isProcessing: isProcessingRef.current,
        });
        console.log(`[WS ${timestamp}] Question timer started:`, data);
        backendExpiredRef.current = false; // new question — reset backend-expired guard
        // Clear the Next-Q in-flight guard: the backend has processed the prior
        // skip (or is starting a fresh question) and re-enables the button.
        if (nextSkipInFlightRef.current) {
          nextSkipInFlightRef.current = false;
          setNextSkipInFlight(false);
        }
        // Same for the Repeat-Question guard: the answer window is (re)open, so
        // the candidate may request another repeat if needed.
        if (repeatInFlightRef.current) {
          repeatInFlightRef.current = false;
          setRepeatInFlight(false);
        }
        // Use data.seconds — the actual candidate answer window sent by the backend.
        // data.total_seconds is the full slot (e.g. 120s) but data.seconds is what
        // the backend's auto-skip is calibrated to, so they must match.
        let dur = data.seconds ?? data.total_seconds ?? data.duration_seconds ?? 120;
        // ── VOICE REPEAT (clarification) → behave like the Repeat button ────
        // A clarification event is Bina RE-SPEAKING the current question because
        // the candidate asked her to repeat/clarify BY VOICE. Updated UX (was:
        // "don't pause on repeat"): the answer clock must NOT reset to a fresh
        // 2:00 and must NOT tick down while Bina re-speaks — it freezes at the
        // value the candidate had when they asked and resumes only when the mic
        // reopens ("Your turn"), exactly like the Repeat Question button.
        //
        // We route it through the SAME freeze-resume path the button uses (just
        // below) by arming repeatFreezeRef here. The resume value is the per-
        // question remaining captured the moment the candidate finished their
        // repeat-request turn (frozenResponseTimeRef) — questionTimerSecondsRef
        // was already nulled by the answer submit, so the frozen ref is the
        // reliable source. This replaces the old branch that kept the countdown
        // running through the re-speak.
        if (data.is_clarification === true && !repeatFreezeRef.current) {
          const _clarifResume =
            (frozenResponseTimeRef.current != null && frozenResponseTimeRef.current > 0)
              ? frozenResponseTimeRef.current
              : (questionTimerSecondsRef.current != null && questionTimerSecondsRef.current > 0)
                ? questionTimerSecondsRef.current
                : null;
          if (_clarifResume != null) {
            repeatFreezeRef.current = true;
            repeatFrozenRemainingRef.current = _clarifResume;
            // One repeat per turn — mirror the button so the resume doesn't
            // re-arm the repeat window (backend auto-advances on the 2nd ask).
            repeatUsedThisTurnRef.current = true;
            console.log(`[Timer ${timestamp}] Clarification (voice repeat) — FREEZING answer clock at ${_clarifResume}s; resumes on "Your turn" (matches Repeat button, no tick during re-speak)`);
          }
        }
        // ── REPEAT-QUESTION FREEZE RESUME ──────────────────────────────────
        // This timer event is the re-speak completing (on_speaking_done →
        // _start_question_timer), and it can arrive while Bina's audio is still
        // playing on the client. We must NOT start ticking now — the answer
        // clock resumes ONLY when the candidate's turn actually opens (the mic
        // goes live → startPendingQuestionTimer("candidate_turn_open")). So we
        // route the frozen remaining through the PENDING mechanism and bail out
        // of this handler, leaving the display frozen until then.
        if (repeatFreezeRef.current) {
          repeatFreezeRef.current = false;
          const resumeSec = (repeatFrozenRemainingRef.current != null && repeatFrozenRemainingRef.current > 0)
            ? repeatFrozenRemainingRef.current
            : dur;
          repeatFrozenRemainingRef.current = null;
          if (data.total_questions != null) setTotalQuestions(data.total_questions);
          setIsClarification(false); isClarificationRef.current = false;
          setIsFollowUp(false);
          setQuestionTimerExpired(false); questionTimerExpiredRef.current = false;
          // Freeze the display at the resume value; don't run an interval yet.
          if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
          setQuestionTimerSeconds(resumeSec);
          questionTimerSecondsRef.current = resumeSec;
          // Queue it as pending; it starts on the next candidate_turn_open.
          questionTimerPendingRef.current = resumeSec;
          questionTimerTotalRef.current = resumeSec;
          questionTimerReceivedAtRef.current = Date.now();
          if (!isAiSpeakingRef.current && isRecordingRef.current) {
            // Mic already open (rare) — start immediately from the frozen value.
            startPendingQuestionTimer("repeat_resume_turn_already_open");
          } else {
            setQuestionTimerPendingTick(t => t + 1);
          }
          console.log(`[Timer ${timestamp}] Repeat re-speak done — answer window will RESUME at ${resumeSec}s when the candidate's turn opens`);
          break;
        }
        // Fix 2: capture Bina's speech share so the UI can show the candidate
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
        // DON'T show the timer yet if Bina is still speaking — it will be shown
        // once Bina stops (via the pending timer useEffect below).
        // When Bina IS still speaking the next question, hold the "TIME UP"
        // state (keep questionTimerExpired=true) until the pending timer
        // actually starts. Otherwise the display would flicker
        // "TIME UP" → "00:00" → "02:00" because seconds is still 0 from the
        // expired prior slot. The pending useEffect clears the flag right
        // before it starts ticking the new countdown.
        if (!isAiSpeakingRef.current) {
          setQuestionTimerExpired(false);
          questionTimerExpiredRef.current = false;
        }
        // Classify this event:
        //  is_follow_up=true, is_clarification=true  → Bina clarifying; PAUSE per-Q timer
        //  is_follow_up=true, is_clarification=false → Bina ack/follow-up; keep timer running
        //  is_follow_up=false                        → new question; start fresh countdown
        const incomingQNum = data.question_number ?? null;
        const sameQuestion = incomingQNum !== null && incomingQNum === questionNumberRef.current;
        if (!sameQuestion) {
          // A new question means the prior answer path is over. Clear any stale
          // candidate-side processing state even if no transcript ever arrived.
          setIsCandidateTranscriptProcessing(false);
          setCurrentTranscript("");
          currentTranscriptRef.current = "";
          provisionalAnswerQnRef.current = null;
          frozenResponseTimeRef.current = null;
        }
        // NEW MAIN QUESTION: clear any leftover live transcript from the prior
        // answer. On long answers in decoupled mode the candidate's speech can
        // spill past end_turn into the next question's mic window and fire a
        // phantom turn — without this clear, the PREVIOUS answer's live text
        // got rendered/committed under the new question too (observed: Q2's
        // answer appearing under Q3). Only the transient live "You" bubble is
        // cleared; the already-committed answer bubble is untouched. Skipped for
        // follow-ups/clarifications (same question — the live text is still theirs).
        if (incomingQNum !== null && incomingQNum !== questionNumberRef.current && !data.is_follow_up) {
          setCurrentTranscript("");
          currentTranscriptRef.current = "";
        }
        if (sameQuestion && (data.is_follow_up === true || data.is_clarification === true)) {
          // Same-slot continuation — do NOT restart the timer. This covers TWO
          // SEPARATE concepts that each keep the original 2-min slot running:
          //   • follow-up      (is_follow_up=true,  is_clarification=false)
          //   • clarification  (is_clarification=true, is_follow_up=false)
          // Clarification is NOT a follow-up — they're gated independently below
          // so the follow-up path/state is never entered for a clarification.
          // The main question's 2-min slot is shared between Bina's repeat/
          // follow-up and the candidate's answer — the countdown must continue
          // from wherever it was, never jump back to the full duration.
          //
          // We deliberately do NOT "drift-correct" toward `data.seconds`
          // here. The frontend timer ticks ONLY while the candidate is on
          // the clock (paused during Bina's speech / clarification),
          // whereas the backend's `remaining` is plain wall-clock from main-Q
          // start and so always includes Bina's TTS time. Snapping the
          // frontend to that value made the timer visibly drop on every
          // follow-up (e.g. 1:00 → 0:45). The frontend countdown is what
          // the candidate is reading and what the auto-skip is calibrated
          // to — keep it authoritative.
          if (data.total_questions != null) setTotalQuestions(data.total_questions);
          const _cur = questionTimerSecondsRef.current;
          if (dur > 0 && _cur == null) {
            // Edge case: no running timer (e.g. reconnect). Start one from
            // the backend value — that's the only signal we have.
            setQuestionTimerSeconds(dur);
            questionTimerSecondsRef.current = dur;
          }
          if (data.is_clarification === true) {
            // CLARIFICATION — its OWN concept, NOT a follow-up. Keep the running
            // countdown and pause it during Bina's repeat. Explicitly mark this
            // as NOT a follow-up so the two concepts never bleed together.
            setIsFollowUp(false);
            // Bug H fix: if the interval was stray-cleared (e.g., remaining
            // hit 0 just before the clarification arrived), the timer would
            // never resume after clarification ends because the interval
            // itself is null. Re-arm it BEFORE pausing so the pause-via-flag
            // model works correctly when clarification clears.
            if (!questionTimerIntervalRef.current && (_cur ?? dur) > 0) {
              ensureQuestionTimerRunning(_cur ?? dur);
            }
            // (2026-06-03) Clarification keeps the SAME running countdown — it
            // does NOT pause and does NOT reset. The timer interval no longer
            // pauses on isClarification, so the window keeps ticking through
            // Bina's repeat (per user spec).
            console.log('[INTERVIEW-DEBUG] clarification — timer keeps running (no pause/reset)', {
              question_number: data.question_number,
              currentSeconds: questionTimerSecondsRef.current,
            });
            setIsClarification(true);
            isClarificationRef.current = true;
            setStatus("Clarifying the question…");
          } else {
            // FOLLOW-UP — unchanged behavior: keep the timer running.
            setIsFollowUp(true);
            if (!questionTimerIntervalRef.current && dur > 0) {
              // Only (re)create an interval if none is running. Re-anchor from
              // the frozen value so the helper's monotonic compute stays valid.
              ensureQuestionTimerRunning(_cur ?? dur);
            }
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
        // New question — clear clarification + follow-up, start fresh countdown.
        // Also clear any frozen value left behind by the previous question's
        // question_timer_stopped (we no longer null it there to keep the banner
        // visible during silent_discard) — otherwise the NEW question would
        // briefly display the OLD answer's leftover seconds while Bina speaks
        // her next question.
        setIsClarification(false);
        isClarificationRef.current = false;
        setIsFollowUp(false);
        setQuestionTimerSeconds(null);
        questionTimerSecondsRef.current = null;
        questionTimerPausedAtRef.current = null;
        questionTimerPausedMsRef.current = 0;
        // Fresh question (different Q number) → new repeat allowance. A repeat
        // re-speak arrives with the SAME number, so this stays true then and the
        // window does NOT re-arm (one repeat per question).
        if (!sameQuestion) repeatUsedThisTurnRef.current = false;

        // Clamp question number — never exceed totalQuestions (safety net for Q15 follow-up edge cases)
        // incomingQNum >= 1 is a real numbered question. 0 = the uncounted
        // "tell me about yourself" warm-up (no HR/TMAY) — leave questionNumber
        // null so the header hides "Q x/15" until the first counted question.
        if (incomingQNum != null && incomingQNum >= 1) setQuestionNumber(Math.min(incomingQNum, totalQuestions ?? incomingQNum));
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
        if (isAiSpeakingRef.current || !isRecordingRef.current) {
          // Keep the timer pending until the candidate turn is ACTUALLY open:
          // Bina has finished, the mic is active, and the listening UI is visible.
          console.log(`[Timer ${timestamp}] Candidate turn not open yet, storing pending timer: ${dur}s`);
          questionTimerPendingRef.current = dur;
          questionTimerTotalRef.current = dur;
          questionTimerReceivedAtRef.current = Date.now();
          // Bump the tick so the pending-timer watchdogs treat this as a new
          // queued timer window.
          setQuestionTimerPendingTick(t => t + 1);
        } else {
          console.log(`[Timer ${timestamp}] Candidate turn already open, starting timer immediately: ${dur}s`);
          questionTimerPendingRef.current = dur;
          questionTimerTotalRef.current = dur;
          questionTimerReceivedAtRef.current = Date.now();
          startPendingQuestionTimer("timer_event_during_open_turn");
        }
        break;
      }
      case "question_timer_stopped":
        console.log('[INTERVIEW-DEBUG] TIMER STOPPED by backend', {
          currentSeconds: questionTimerSecondsRef.current,
          isRecording: isRecordingRef.current,
          isProcessing: isProcessingRef.current,
        });
        // Candidate ended their turn — pause the visible per-question timer,
        // do NOT zero out questionTimerSeconds. Reason: the backend fires
        // question_timer_stopped on EVERY end_turn, including ones that get
        // silent_discarded a moment later. If we wipe the value here, the
        // banner disappears and never comes back when the mic reopens — the
        // candidate sees the answer-time timer flicker out and then nothing,
        // which makes the 2-min slot invisible. Freezing the displayed value
        // (clear the interval only) keeps the banner visible at its last
        // value; the silent_discard handler resumes the tick if needed, and
        // the next question_timer_started fully resets the value.
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        // Pause-stamp the monotonic anchor so the resume in silent_discard can
        // fold the paused interval into questionTimerPausedMsRef.
        if (questionTimerPausedAtRef.current === null) {
          questionTimerPausedAtRef.current = performance.now();
        }
        // Note: questionTimerSeconds / questionTimerSecondsRef intentionally NOT
        // cleared. questionTimerPendingRef is also kept — if Bina hadn't yet
        // finished speaking when end_turn fired (rare), the next audio_end will
        // still pick it up.
        break;
      case "question_timer_expired":
        console.log('[INTERVIEW-DEBUG] question_timer_expired received', {
          isRecording: isRecordingRef.current,
          speechDetected: speechDetectedRef.current,
          isProcessing: isProcessingRef.current,
          isAiSpeaking: isAiSpeakingRef.current,
          questionTimerSeconds: questionTimerSecondsRef.current,
        });
        backendExpiredRef.current = true; // backend already handling skip — don't send client skip_question
        setQuestionTimerExpired(true);
        questionTimerExpiredRef.current = true;
        setQuestionTimerSeconds(0);
        // Also zero the REF, not just the state. stopRecording() (called via
        // stopRecordingSilentRef below) freezes the response-bubble "X left"
        // badge from questionTimerSecondsRef.current — if we leave the ref at
        // its last 200ms-tick value (e.g. 2, since the backend's expiry fires a
        // beat before the local countdown visibly hits 0) the badge shows
        // "00:02 left" instead of "00:00" on a genuine time's-up.
        questionTimerSecondsRef.current = 0;
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        // Clear clarification and silence countdown — question is advancing
        setIsClarification(false);
        isClarificationRef.current = false;
        setShowSilenceBanner(false);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        // Clear processing state so startRecordingInternal isn't blocked when next Q arrives.
        setIsProcessing(false);
        isProcessingRef.current = false;
        clearNoResponseTimer();
        stopRecordingSilentRef.current();
        setStatus("Time's up — moving to the next question...");
        break;
      case "question_window_hard_cap":
        // Backend hit the 2:00 mark while candidate was still answering. It
        // has already flushed the captured audio (<=120s) into the natural
        // end_turn pipeline; Bina will ask the next question in a few
        // seconds. Stop the mic so nothing said after 2:00 is sent.
        console.log('[INTERVIEW-DEBUG] question_window_hard_cap received', {
          question_number: data.question_number,
          isRecording: isRecordingRef.current,
        });
        backendExpiredRef.current = true; // suppress any local skip_question
        setQuestionTimerExpired(true);
        questionTimerExpiredRef.current = true;
        setQuestionTimerSeconds(0);
        // Zero the REF too (see question_timer_expired above): stopRecording
        // freezes the "X left" badge from questionTimerSecondsRef.current, so a
        // stale last-tick value here makes a 2:00 hard-cap show "00:02 left".
        questionTimerSecondsRef.current = 0;
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setIsClarification(false);
        isClarificationRef.current = false;
        setShowSilenceBanner(false);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        setIsProcessing(false);
        isProcessingRef.current = false;
        clearNoResponseTimer();
        stopRecordingSilentRef.current();
        // Backend now plays a bridge phrase (Bina actually speaks) immediately
        // after this event. Only fall back to the legacy text overlay when the
        // bridge has been suppressed (empty `message`) — preserves backwards
        // compatibility with pre-bridge backends that still ship the text.
        if (data.message) {
          setStatus(data.message);
        }
        break;
      case "bridge_phrase_started":
        // Pre-cached transition clip is about to stream. Show the phrase text
        // as a distinct "Bina · Transition" chip — NOT in the question card.
        // Mic stays disabled (gated by the speaking_started that follows).
        setBridgeCaption(typeof data.text === 'string' ? data.text : null);
        break;
      case "bridge_phrase_ended":
        // Brief fade-out so the chip doesn't pop off mid-syllable when the
        // next-Q TTS arrives <500ms later.
        setTimeout(() => setBridgeCaption(null), 400);
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
        // Backend detected the first silence threshold. Show a banner telling
        // the candidate Bina is about to prompt them. The BACKEND drives the
        // actual silence ladder and auto-skip from here. We previously ran our
        // OWN countdown on the client and sent skip_question — that raced with
        // Bina's TTS and caused multiple "Are you there?" messages to stack up
        // because the client skipped before she finished speaking.
        //
        // Banner is dismissed by:
        //   - speaking_started  (candidate responded)
        //   - speaking_started from backend for Bina's silence nudge (covered
        //     below in the interstitial_prompt/speaking_started handlers)
        //   - question_timer_expired (backend auto-skip completed)
        //   - X button in the banner itself
        isSilencePromptRef.current = true; // Bina's "Are you there?" — timer must keep running
        setShowSilenceBanner(true);
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
      case "speech_threshold_not_met":
        // Backend decided the speech_started we sent was noise-floor audio, not
        // real speech — it's keeping the silence-nudge watcher armed. Reset our
        // speechDetected flag so that when Bina's nudge fires speaking_started,
        // stopRecordingSilent does NOT send end_turn with the hallucinated ASR text.
        speechDetectedRef.current = false;
        speechDetectedAtRef.current = null;
        speechStartSentRef.current = false;
        speechFrameCountRef.current = 0;
        break;
      case "question_timer_nudge":
        // Candidate has been silent for a long time — gentle prompt; don't override the
        // silence banner countdown if it's already running.
        if (!showSilenceBanner) {
          setStatus("Take your time — share whatever comes to mind, or say 'skip' to move on.");
        }
        break;
      case "interview_completion_message":
        // Show the official completion message (Req 16) — but ONLY after
        // Bina's farewell has finished playing. Backend sends this event
        // immediately after `interview_ended` without waiting for TTS
        // playback to drain. If we flip the modal on now, it appears while
        // Bina is still audibly speaking. Defer via pendingCompletionModalRef
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
        setStatus("Interview ending - Bina is saying goodbye...");
        break;
      case "interview_ended":
        setStatus("Bina is saying goodbye...");
        shouldDisconnectAfterAudioRef.current = true;
        setIsClosing(true); isClosingRef.current = true;
        // Interview reached its natural end — tell the portal to DISARM
        // fullscreen-exit termination so the completion popup can't trigger a
        // false termination while the background evaluation runs.
        onInterviewClosing?.();
        setCompletionMessage(prev =>
          prev || (
            data.reason === "candidate_ended"
              ? "Thank you for your time. The interview has ended successfully."
              : "Thank you for completing the interview. Your responses have been recorded successfully."
          )
        );
        // Tear down the per-question timer — interview is over, no more answer
        // window. Without this clear, the frozen-on-stop change above would
        // leave the answer-time banner visible during Bina's farewell.
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setQuestionTimerSeconds(null);
        questionTimerSecondsRef.current = null;
        questionTimerPendingRef.current = null;
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
          setTimeout(() => { disconnectRef.current(); }, 500);
        }
        break;
      case "interview_complete":
        // Server-side forced completion (e.g., post-closing turn limit or
        // end of Q15). Same guard as interview_ended: only disconnect
        // immediately if finalizePlayback has already run — otherwise the
        // closing flags will be picked up by finalizePlayback when the
        // real end-of-audio fires. This is what keeps Bina's farewell
        // from being cut off mid-sentence.
        setIsClosing(true); isClosingRef.current = true;
        shouldDisconnectAfterAudioRef.current = true;
        setStatus("Interview completed. Thank you!");
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setQuestionTimerSeconds(null);
        questionTimerSecondsRef.current = null;
        questionTimerPendingRef.current = null;
        if (candidatePlaybackEndedRef.current) {
          setTimeout(() => { disconnectRef.current(); }, 500);
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
          setTimeout(() => { disconnectRef.current(); }, 500);
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
            startRecordingInternalRef.current();
          }
        }, 2000);
        break;
      // AIU39: Skip accepted/rejected responses
      case "skip_accepted":
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
  }, [
    avatarState,
    buildStableLiveTranscriptPreview,
    clearNoResponseTimer,
    ensureQuestionTimerRunning,
    interviewInfo.duration_minutes,
    interviewInfo.total_questions,
    isFlexibleMode,
    isNewFlexibleMode,
    questionNumber,
    questionTimerExpired,
    saveAiMessage,
    sendPlaybackComplete,
    showSilenceBanner,
    startRevealingTokens,
    stopRevealingTokens,
    stopWebSpeechRecognition,
    totalQuestions,
    whenTrackedPlaybackEnds,
  ]);

  // Keep callback refs in sync (avoids WebSocket reconnect on re-renders)
  useEffect(() => { queueAudioRef.current = queueAudio; }, [queueAudio]);
  useEffect(() => { trackPlaybackChunkRef.current = trackPlaybackChunk; }, [trackPlaybackChunk]);
  useEffect(() => { handleMessageRef.current = handleMessage; }, [handleMessage]);

  // Checkpoint upload — flushes the recorder's buffer and ships ONE multipart
  // segment WITHOUT stopping the recorder, but only once enough bytes have
  // accumulated to form a valid S3 part (>= RECORDING_MIN_SEGMENT_BYTES). Called
  // on a 30 s timer and on visibilitychange→hidden. Because S3 forbids
  // sub-5-MiB non-final parts, small buffers are intentionally held back until
  // the next tick rather than flushed; the trailing remainder ships as the final
  // (any-size) part from uploadRecording().
  const uploadCheckpoint = useCallback(async (): Promise<void> => {
    if (isFinalizingUploadRef.current) return; // final upload owns the recorder
    if (checkpointInProgressRef.current) return; // skip overlap
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    checkpointInProgressRef.current = true;
    try {
      // Force ondataavailable to fire so any buffered frames are emitted now.
      // We swap in a one-shot handler that ALSO defers to the original handler
      // (so chunks are still pushed into recordedChunksRef). The native handler
      // is restored once we resolve.
      const original = recorder.ondataavailable;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          recorder.ondataavailable = original;
          resolve();
        };
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          finish();
        };
        try {
          recorder.requestData();
        } catch {
          finish();
          return;
        }
        // Safety net — some browsers don't fire on requestData() while throttled
        setTimeout(finish, 1500);
      });

      const buffered = recordedChunksRef.current.reduce((sum, c) => sum + c.size, 0);
      // Not enough for a valid non-final S3 part yet — keep buffering.
      if (buffered < RECORDING_MIN_SEGMENT_BYTES) return;

      // Atomically snapshot the buffered clusters and reset the ref so new
      // clusters accumulate into a fresh array. Single-threaded JS guarantees no
      // ondataavailable push can race between these two synchronous statements.
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      const segmentIndex = recordingSegmentIndexRef.current;
      const mimeType = (recorder.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mimeType });
      try {
        await candidateAIInterviewService.uploadRecording(token, blob, segmentIndex, false);
        recordingSegmentIndexRef.current = segmentIndex + 1;
        console.log(`[Recording] Segment ${segmentIndex} uploaded: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      } catch (err: unknown) {
        // Upload failed — put the clusters back at the FRONT of the buffer so the
        // next checkpoint retries them under the SAME segment index (preserves
        // part ordering; the backend overwrites the part idempotently on retry).
        recordedChunksRef.current = chunks.concat(recordedChunksRef.current);
        console.warn(`[Recording] Segment ${segmentIndex} upload failed — size: ${(blob.size / 1024 / 1024).toFixed(1)} MB, error: ${getErrorMessage(err)}`);
      }
    } finally {
      checkpointInProgressRef.current = false;
    }
  }, [token]);

  // Keep ref in sync so the periodic timer scheduled inside startRecorder
  // (set up before this callback exists in the closure) always sees the latest.
  useEffect(() => { uploadCheckpointRef.current = uploadCheckpoint; }, [uploadCheckpoint]);
  // Mirror the transcript-processing flag into a ref for the re-arm guards.
  useEffect(() => { isCandidateTranscriptProcessingRef.current = isCandidateTranscriptProcessing; }, [isCandidateTranscriptProcessing]);

  // Tab-visibility checkpoint — flush before the browser may throttle us
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        uploadCheckpointRef.current().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Upload recording
  // Waits for MediaRecorder.onstop (all ondataavailable chunks flushed) before
  // uploading — prevents the race-condition where the final chunk was still
  // in the encoder buffer when we read recordedChunksRef.
  const uploadRecording = useCallback((): Promise<void> => {
    // SINGLE-FLIGHT: if a final flush is already running (or finished), reuse it.
    // Without this the ws.onclose path and the unmount path each POST their own
    // final segment for the same recording — the duplicate-final race that lost
    // recordings with a 502 InvalidPart.
    if (finalUploadPromiseRef.current) {
      console.log('[Recording] Final upload already in flight — joining it instead of starting a second');
      return finalUploadPromiseRef.current;
    }

    const recorder = mediaRecorderRef.current;
    // Take ownership of the recorder away from the checkpoint path.
    isFinalizingUploadRef.current = true;
    if (checkpointTimerRef.current) {
      clearInterval(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }

    const doUpload = async () => {
      // Wait out any in-flight checkpoint segment so its part lands BEFORE we
      // complete the multipart upload — otherwise a late part could arrive after
      // CompleteMultipartUpload and be discarded. Bounded to ~6s.
      for (let i = 0; i < 60 && checkpointInProgressRef.current; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      // Final segment: ship whatever clusters remain since the last checkpoint as
      // the LAST multipart part (any size allowed) with is_final=true, which tells
      // the backend to complete the multipart upload into one object. Even if the
      // buffer is empty (everything already flushed as full parts), we still send
      // the final marker so the backend assembles the object.
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      const segmentIndex = recordingSegmentIndexRef.current;
      const mimeType = (recorder?.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mimeType });
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
      console.log(`[Recording] Final segment ${segmentIndex}: ${chunks.length} chunks, ${sizeMb} MB, recorder=${recorder?.state ?? 'null'}`);

      // RETRY the final upload. This request is what turns the already-uploaded
      // parts into a playable object — if it is the only attempt and it 502s,
      // the whole recording is lost. The blob is held in this closure across
      // attempts, so nothing is discarded between tries, and the request is
      // idempotent server-side (same segment_index → same part number; an
      // already-assembled object is reported back rather than rebuilt).
      const FINAL_UPLOAD_ATTEMPTS = 4;
      for (let attempt = 1; attempt <= FINAL_UPLOAD_ATTEMPTS; attempt++) {
        try {
          await candidateAIInterviewService.uploadRecording(token, blob, segmentIndex, true);
          recordingSegmentIndexRef.current = segmentIndex + 1;
          console.log(`[Recording] Final upload + multipart completion succeeded${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
          return;
        } catch (err: unknown) {
          const msg = getErrorMessage(err);
          if (attempt < FINAL_UPLOAD_ATTEMPTS) {
            // Back off and try again — 502s here are usually the transient
            // completion race, which the server now resolves on a retry.
            const waitMs = 800 * attempt;
            console.warn(`[Recording] Final upload attempt ${attempt}/${FINAL_UPLOAD_ATTEMPTS} failed (${sizeMb} MB): ${msg} — retrying in ${waitMs}ms`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          // Out of attempts. The parts already in MinIO are NOT lost: the
          // backend leaves them in place and the interview-close salvage
          // (finalize_pending) assembles them. Log loudly so this is greppable.
          console.error(`[Recording] Final upload FAILED after ${FINAL_UPLOAD_ATTEMPTS} attempts — size: ${sizeMb} MB, error: ${msg} — server-side salvage should assemble the uploaded parts`);
        }
      }
    };

    // Recorder already stopped — upload whatever chunks we have now
    if (!recorder || recorder.state === 'inactive') {
      const p = doUpload();
      finalUploadPromiseRef.current = p;
      return p;
    }

    // Recorder still running — stop it and wait for onstop before uploading
    const p = new Promise<void>((resolve) => {
      recorder.onstop = () => { doUpload().then(resolve).catch(() => resolve()); };
      recorder.stop();
    });
    finalUploadPromiseRef.current = p;
    return p;
  }, [token]);

  // Keep a live ref to uploadRecording so the unmount-only cleanup can flush the
  // candidate webcam recording without adding uploadRecording to its deps.
  // MUST be declared AFTER uploadRecording — referencing it earlier hits the
  // const temporal-dead-zone ("Cannot access before initialization") and crashes
  // the whole interview screen.
  useEffect(() => { uploadRecordingRef.current = uploadRecording; }, [uploadRecording]);

  // Recording
  const stopRecording = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log('[INTERVIEW-DEBUG] stopRecording called', {
      isRecording: isRecordingRef.current,
      speechDetected: speechDetectedRef.current,
      questionTimerSeconds: questionTimerSecondsRef.current,
      questionTimerExpired: questionTimerExpiredRef.current,
    });
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
    lastMeaningfulAudioAtRef.current = null;
    lastStrongVoiceAtRef.current = null;
    activeStreakStartRef.current = null;
    lastActiveFrameAtRef.current = null;
    speechPeakLevelRef.current = 0;
    inTurnSpeechFrameCountRef.current = 0;
    candidateAudioStreamingRef.current = false;
    candidateAudioFrameCountRef.current = 0;
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
        teardownRecordingMedia();
      }, 100);
      return;
    }

    const remainingFinalized = webSpeechFinalizedRef.current.slice(liveBatchSentCharsRef.current).trim();
    if (remainingFinalized && (isFlexibleMode || isNewFlexibleMode)) {
      sendLiveTranscriptBatch(remainingFinalized, "candidate_stop");
      liveBatchSentCharsRef.current = webSpeechFinalizedRef.current.length;
    }

    const browserTranscript = backendLiveTranscriptEnabled ? "" : snapshotVisibleLiveTranscript();
    // Do NOT commit the live transcript as a final answer. The backend owns
    // English-only validation and sends the accepted transcript; until then the
    // UI shows only a candidate-side processing indicator.
    setIsCandidateTranscriptProcessing(true);
    setCurrentTranscript("");
    currentTranscriptRef.current = "";

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
      teardownRecordingMedia();
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
      // A fresh question_timer_started will reset it when Bina asks the next question.
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
      // Do NOT clear questionTimerExpired here. If the candidate finished
      // talking right as the timer hit 0:00, the expired flag was set by
      // startQuestionTimerExpiry and represents the truth — wiping it here
      // causes the "Question time: 00:00" stuck-label bug (label flips back
      // to non-expired state while Bina speaks the next question). The
      // pending-timer useEffect clears expired immediately before starting
      // the next countdown, so the flag transitions cleanly TIME UP → 02:00.
      questionTimerPendingRef.current = null;
      questionTimerReceivedAtRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "end_turn",
          browser_transcript: browserTranscript || undefined,
        }));
      }
    }, 100);
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, clearMaxRecordingTimer, voiceVerification, isFlexibleMode, isNewFlexibleMode, sendLiveTranscriptBatch, snapshotVisibleLiveTranscript, backendLiveTranscriptEnabled, teardownRecordingMedia]);

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
    lastMeaningfulAudioAtRef.current = null;
    lastStrongVoiceAtRef.current = null;
    activeStreakStartRef.current = null;
    lastActiveFrameAtRef.current = null;
    speechPeakLevelRef.current = 0;
    inTurnSpeechFrameCountRef.current = 0;
    candidateAudioStreamingRef.current = false;
    candidateAudioFrameCountRef.current = 0;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    clearMaxRecordingTimer();

    if (hadSpeech) {
      const remainingFinalized = webSpeechFinalizedRef.current.slice(liveBatchSentCharsRef.current).trim();
      if (remainingFinalized && (isFlexibleMode || isNewFlexibleMode)) {
        sendLiveTranscriptBatch(remainingFinalized, "candidate_stop");
        liveBatchSentCharsRef.current = webSpeechFinalizedRef.current.length;
      }
      const browserTranscript = backendLiveTranscriptEnabled ? "" : snapshotVisibleLiveTranscript();
      // Candidate was mid-answer: capture timer snapshot, keep transcript visible,
      // and send end_turn so Whisper processes their audio (never silently discard).
      frozenResponseTimeRef.current = questionTimerSecondsRef.current;
      // Do NOT commit the live transcript as a final answer. The backend owns
      // English-only validation and sends the accepted transcript.
      setIsCandidateTranscriptProcessing(true);
      setCurrentTranscript("");
      currentTranscriptRef.current = "";
      voiceVerifBufferRef.current = [];
      setTimeout(() => {
        teardownRecordingMedia(false);
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
        // Same reasoning as stopRecording: don't wipe expired here; the
        // pending-timer useEffect clears it cleanly when the next countdown
        // is about to start.
        questionTimerPendingRef.current = null;
        questionTimerReceivedAtRef.current = null;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "end_turn",
            browser_transcript: browserTranscript || undefined,
          }));
        }
      }, 100);
      return;
    }

    // No speech detected: silent discard — clear transcript and stop cleanly
    setCurrentTranscript("");
    teardownRecordingMedia();
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, clearMaxRecordingTimer, isFlexibleMode, isNewFlexibleMode, sendLiveTranscriptBatch, snapshotVisibleLiveTranscript, backendLiveTranscriptEnabled, teardownRecordingMedia]);

  // Manual Next/skip must ABORT the current answer entirely. Reusing
  // stopRecordingSilent() is unsafe here because a false-positive speechDetected
  // bit can still schedule an end_turn 100 ms later, and that stale end_turn
  // lands after the backend already advanced to the next question.
  const abortRecordingForSkip = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    speechDetectedAtRef.current = null;
    speechStartSentRef.current = false;
    lastMeaningfulAudioAtRef.current = null;
    lastStrongVoiceAtRef.current = null;
    activeStreakStartRef.current = null;
    lastActiveFrameAtRef.current = null;
    speechPeakLevelRef.current = 0;
    candidateAudioStreamingRef.current = false;
    candidateAudioFrameCountRef.current = 0;
    preSpeechPCMRingRef.current = [];
    preSpeechPCMSampleCountRef.current = 0;
    voiceVerifBufferRef.current = [];
    frozenResponseTimeRef.current = null;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    clearMaxRecordingTimer();
    removeAudioDeviceChangeListener();
    pinnedAudioDeviceIdRef.current = undefined;
    setIsCandidateTranscriptProcessing(false);
    setCurrentTranscript("");
    currentTranscriptRef.current = "";
    setMicInputLevel(0);
    lastGoodMicAtRef.current = null;
    micInputLowRef.current = false;
    setMicInputLow(false);
    teardownRecordingMedia(false);
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, clearMaxRecordingTimer, teardownRecordingMedia]);

  // Tester mute toggle removed per UX request. The mute STATE (isMuted /
  // isMutedRef) is still used internally by proctoring/fullscreen enforcement
  // paths, but there is no longer a user-facing manual mute button.

  const startRecordingInternal = async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Recording ${timestamp}] startRecordingInternal called: isAiSpeaking=${isAiSpeakingRef.current}, isProcessing=${isProcessingRef.current}, isRecording=${isRecordingRef.current}, isFaceBlocked=${isFaceBlockedRef.current}`);
    // Use refs — NOT state values — because this function is called from stale
    // closures (useCallback, setTimeout) where isAiSpeaking/isProcessing are stale.
    if (isAiSpeakingRef.current || isProcessingRef.current || isRecordingRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by state`);
      return;
    }
    // Do NOT reopen the mic while a PREVIOUS answer is still being transcribed.
    // Otherwise a same-slot second utterance races the first answer and can wipe
    // it (the "spoke the full 2 min → mic reopened → said a few words → 2-min
    // answer lost" bug). The backend clears this flag (via the transcript /
    // silent_discard / transcript_discarded messages) as soon as the prior
    // answer resolves, and the next question's question_timer_started then
    // re-arms normally — so this never permanently blocks the mic.
    if (isCandidateTranscriptProcessingRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked — previous answer still transcribing`);
      return;
    }
    if (isFaceBlockedRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by face detection`);
      return;
    }
    if (isMutedRef.current) {
      // Auto-unmute when a new question's recording is starting, unless the
      // mic was force-muted by armMediaBlock (camera/mic permission denied)
      // or by fullscreen-exit grace-expiry. Those legitimate mutes have their
      // own state flags (mediaBlocked / isFullscreenExited) — if neither is
      // set, the mute is stale (e.g. left over from a prior user toggle or
      // an implicit mute) and we should lift it so the candidate can answer
      // without manually clicking the mic icon every question.
      if (mediaBlockedRef.current || isFullscreenExitedRef.current) {
        console.log('[INTERVIEW-DEBUG] startRecording BLOCKED — mic is muted (legitimate force-mute)', {
          questionTimerSeconds: questionTimerSecondsRef.current,
          mediaBlocked: mediaBlockedRef.current,
          isFullscreenExited: isFullscreenExitedRef.current,
        });
        console.log(`[Recording ${timestamp}] startRecordingInternal blocked by force-mute`);
        return;
      }
      console.log('[INTERVIEW-DEBUG] Auto-unmuting stale mic state so candidate can answer', {
        questionTimerSeconds: questionTimerSecondsRef.current,
      });
      isMutedRef.current = false;
      setIsMuted(false);
      // Proceed past the gate — recording will start normally.
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
    // "Your Turn" is now open — resume the per-question answer clock if it was
    // paused while Bina spoke (repeat / "Are you there?" / prompt). No-op for a
    // fresh question (its timer starts un-paused via ensureQuestionTimerRunning).
    resumeQuestionTimer();
    console.log('[INTERVIEW-DEBUG] Recording STARTED', {
      questionTimerSeconds: questionTimerSecondsRef.current,
      questionNumber: questionNumberRef.current,
      isProcessing: isProcessingRef.current,
      isAiSpeaking: isAiSpeakingRef.current,
    });
    // ── Batch models: NO browser Web Speech API (2026-07) ─────────────────
    // Batch STT providers (gpt-4o-transcribe / gemini / sarvam / assemblyai) no
    // longer use the browser Web Speech API for a live caption — it was laggy /
    // unreliable and depended on Google's servers. Instead the UI shows a live
    // RECORDING WAVEFORM while the candidate answers (see the render block); the
    // final transcript arrives from the backend after the turn. Streaming
    // providers (Deepgram / OpenAI realtime) keep their backend-driven live
    // transcript. Reset the per-turn gate; the "Your turn" popup shows once the
    // capture pipeline is ready (markListeningStarted, below).
    turnPipelineReadyRef.current = false;
    webSpeechListeningRef.current = false;
    // Web Speech API is intentionally DISABLED for batch models (a recording
    // waveform is shown instead — see render). startWebSpeechRecognition() is
    // kept for reference / easy re-enable; `void` references it so it isn't
    // flagged as unused. To re-enable, call it here when !backendLiveTranscriptEnabled.
    void startWebSpeechRecognition;
    console.log(`[Recording ${timestamp}] Starting recording...`);
    try {
      // Prefer a dedicated per-turn answer-capture microphone for VAD + ASR so
      // headset speech is not coupled to the webcam/proctoring audio path.
      // Fall back to the shared webcam audio track only if the browser refuses
      // the separate mic stream.
      const stream = await getRecordingAudioStream();

      // Capture the device ID of the track we actually got. This is the real
      // answer-capture device in use for this turn.
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        try {
          const actualDeviceId = audioTracks[0].getSettings?.().deviceId;
          const actualLabel = audioTracks[0].label || "Selected microphone";
          setActiveMicLabel(actualLabel);
          if (actualDeviceId && actualDeviceId !== pinnedAudioDeviceIdRef.current) {
            console.log(`[Recording ${timestamp}] Device ID captured: ${actualDeviceId}`);
            pinnedAudioDeviceIdRef.current = actualDeviceId;
          }
        } catch {
          setActiveMicLabel(audioTracks[0].label || "Selected microphone");
          console.log(`[Recording ${timestamp}] getSettings not supported, skipping device ID capture`);
        }

        // Listen for device changes while recording. The answer-capture mic now
        // runs on its own stream, so only that live recording stream matters
        // here; webcam/proctoring recovery is handled separately above.
        const handleDeviceChange = async () => {
          if (!isRecordingRef.current) return;
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(d => d.kind === 'audioinput');
            const pinnedStillExists =
              !pinnedAudioDeviceIdRef.current ||
              audioDevices.some(d => d.deviceId === pinnedAudioDeviceIdRef.current);
            const recordingTrackLive = Boolean(
              mediaStreamRef.current
                ?.getAudioTracks()
                .find(track => track.readyState === 'live')
            );
            if ((!pinnedStillExists && audioDevices.length > 0) || !recordingTrackLive) {
              console.warn(`[Recording ${timestamp}] Recording microphone changed or disconnected — restarting answer capture`);
              stopRecordingSilentRef.current();
              setTimeout(() => {
                if (
                  isRecordingRef.current === false &&
                  wsRef.current?.readyState === WebSocket.OPEN &&
                  !isAiSpeakingRef.current &&
                  !isProcessingRef.current &&
                  !isMutedRef.current &&
                  !isFaceBlockedRef.current
                ) {
                  startRecordingInternalRef.current();
                }
              }, 100);
            }
          } catch (err) {
            console.error(`[Recording ${timestamp}] Device enumeration failed:`, err);
          }
        };

        removeAudioDeviceChangeListener();
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        audioDeviceChangeListenerRef.current = handleDeviceChange;
      }

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

      // Tap a passive AnalyserNode off the mic source for the live recording
      // waveform (MicWaveform). source→analyser only — NOT →destination, so it
      // never plays back / echoes. Re-created each recording session.
      try {
        const _micAnalyser = ctx.createAnalyser();
        _micAnalyser.fftSize = 256;
        _micAnalyser.smoothingTimeConstant = 0.6;
        source.connect(_micAnalyser);
        micAnalyserRef.current = _micAnalyser;
      } catch {
        micAnalyserRef.current = null;
      }

      // Downsample to 16kHz for the backend (hardware rate is typically 44.1/48kHz)
      const targetSampleRate = 16000;
      const downsampleRatio = ctx.sampleRate / targetSampleRate;

      silenceStartRef.current = null;
      speechDetectedRef.current = false;
      speechDetectedAtRef.current = null;
      speechStartSentRef.current = false;
      speechFrameCountRef.current = 0;
      lastMeaningfulAudioAtRef.current = null;
    lastStrongVoiceAtRef.current = null;
    activeStreakStartRef.current = null;
    lastActiveFrameAtRef.current = null;
      speechPeakLevelRef.current = 0;
      micRecentPeakRef.current = 0;
      inTurnSpeechFrameCountRef.current = 0;
      ambientNoiseFloorRef.current = POSSIBLE_SPEECH_LEVEL * 0.5;
      candidateAudioStreamingRef.current = false;
      candidateAudioFrameCountRef.current = 0;
      lastBrowserTranscriptTextRef.current = "";
      lastBrowserTranscriptUpdateAtRef.current = null;
      lastLiveTranscriptTextRef.current = "";
      lastLiveTranscriptUpdateAtRef.current = null;
      turnHasLiveTranscriptRef.current = false;
      liveTranscriptDisplayRef.current = "";
      micLevelLastUpdateRef.current = 0;
      setMicInputLevel(0);
      lastGoodMicAtRef.current = null;
      micInputLowRef.current = false;
      setMicInputLow(false);
      // Pre-speech ring buffer: cleared at turn start so the previous turn's
      // tail can't leak into this turn's flush.
      preSpeechPCMRingRef.current = [];
      preSpeechPCMSampleCountRef.current = 0;
      // Suppress VAD for the first VAD_WARMUP_MS after mic opens.
      // Gives the echo canceller time to calibrate so Bina's TTS echo doesn't
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

        // Collect raw audio at native sample rate for voice verification.
        // Skip while Bina is speaking or during the post-TTS echo-guard
        // window — capturing those frames poisons the verification buffer
        // with the AI's voice (re-entering via speakers→mic) and causes
        // false voice_identity_changed events on the candidate's own turns.
        if (
          voiceVerification?.hasBaseline() &&
          !isAiSpeakingRef.current &&
          Date.now() >= playbackEchoGuardUntilRef.current
        ) {
          voiceVerifBufferRef.current.push(new Float32Array(input));
        }

        // Compute average absolute amplitude (RAW, pre-gain)
        let sum = 0;
        for (let i = 0; i < input.length; i++) { sum += Math.abs(input[i]); }
        const rawLevel = sum / input.length;

        // Skip empty frames — AudioWorklet can produce zero-filled frames.
        // Checked on the RAW level so boosting can't un-skip a silent frame.
        if (rawLevel < 0.0001) return;

        // ── Adaptive gain: boost quiet (headset) mics toward a target level ──
        // Track a slowly-decaying recent peak; gain brings that peak up to the
        // target, clamped to [1, MIC_GAIN_MAX]. A built-in mic already at/above
        // target gets gain≈1. The peak floor caps how high gain can climb while
        // the candidate is silent, so steady noise isn't amplified into a false
        // trigger. The SAME micGain is applied to the VAD level (below) and the
        // PCM bytes sent to ASR (pcmEarly), so detection and transcription see
        // a consistent, audible signal regardless of device.
        // (1) Gain — ceiling comes from the active device profile.
        micRecentPeakRef.current = Math.max(rawLevel, micRecentPeakRef.current * 0.995);
        const micGain = Math.min(
          micGainMaxRef.current,
          Math.max(1, micGainTargetRef.current / Math.max(micRecentPeakRef.current, MIC_GAIN_PEAK_FLOOR)),
        );
        const avgLevel = rawLevel * micGain;
        _dbgAvgLevelRef.current = avgLevel; // dev overlay
        _dbgChunkCountRef.current++;        // dev overlay

        // ── Voice-band spectral ratio: is this frame human-speech-like? ──
        // Fraction of mic spectral energy inside VOICE_BAND_LOW..HIGH_HZ. Speech
        // concentrates energy there (~0.6–0.9); broadband noise / hum / music
        // spread it out (lower). Used only as an ADDITIONAL gate on NEW-speech
        // detection and on what resets the in-turn silence clock — never on its
        // own, always combined with the energy checks. Defaults to 1 (voice-like)
        // when no analyser is present so it can never block on unsupported setups.
        let voiceBandRatio = 1;
        const _an = micAnalyserRef.current;
        if (_an) {
          const bins = _an.frequencyBinCount;
          if (!freqBufRef.current || freqBufRef.current.length !== bins) {
            freqBufRef.current = new Uint8Array(bins);
          }
          const fb = freqBufRef.current;
          _an.getByteFrequencyData(fb);
          const hzPerBin = ctx.sampleRate / _an.fftSize;
          const loBin = Math.max(1, Math.floor(VOICE_BAND_LOW_HZ / hzPerBin));
          const hiBin = Math.min(bins - 1, Math.ceil(VOICE_BAND_HIGH_HZ / hzPerBin));
          let bandSum = 0;
          let totalSum = 0;
          for (let i = 0; i < bins; i++) {
            const v = fb[i];
            totalSum += v;
            if (i >= loBin && i <= hiBin) bandSum += v;
          }
          // Only trust the ratio when there's meaningful spectral energy; on
          // near-silence totalSum≈0, so treat as voice-like (1) — the energy
          // gates handle silence, this gate only matters for LOUD frames.
          voiceBandRatio = totalSum > 12 ? bandSum / totalSum : 1;
        }
        _dbgVoiceRatioRef.current = voiceBandRatio;
        const voiceLike = voiceBandRatio >= VOICE_BAND_MIN_RATIO;

        const nowMs = Date.now();
        if (nowMs - micLevelLastUpdateRef.current > 120) {
          micLevelLastUpdateRef.current = nowMs;
          const level = Math.min(1, avgLevel / 0.03);
          setMicInputLevel(level);
          // Sustained-low detection for the warning (NOT the moving bar, which
          // keeps reflecting the instantaneous level). Any real speech peak
          // (level >= GOOD) resets the clock; the warning only turns on after
          // LOW_MS of continuously low input — so it never flickers during the
          // natural pauses between words/sentences.
          const GOOD_LEVEL = 0.15;
          const LOW_MS = 5000;
          if (lastGoodMicAtRef.current === null) lastGoodMicAtRef.current = nowMs;
          if (level >= GOOD_LEVEL) {
            lastGoodMicAtRef.current = nowMs;
            if (micInputLowRef.current) { micInputLowRef.current = false; setMicInputLow(false); }
          } else if (nowMs - lastGoodMicAtRef.current > LOW_MS) {
            if (!micInputLowRef.current) { micInputLowRef.current = true; setMicInputLow(true); }
          }
        }

        // ── Encode PCM up-front so warmup / pre-detection audio can also be
        // captured into the ring buffer. The old code returned early on
        // `vadWarmupUntilRef` which silently dropped ~600ms of audio. Combined
        // with the 3-frame speech-confirmation delay (~280ms), the candidate's
        // first ~850ms of speech never reached the backend.
        let samplesEarly: Float32Array;
        if (downsampleRatio > 1) {
          const outputLen = Math.floor(input.length / downsampleRatio);
          samplesEarly = new Float32Array(outputLen);
          for (let i = 0; i < outputLen; i++) {
            const pos = i * downsampleRatio;
            const idx = Math.floor(pos);
            const frac = pos - idx;
            const a = input[idx] ?? 0;
            const b = input[Math.min(idx + 1, input.length - 1)] ?? 0;
            samplesEarly[i] = a + frac * (b - a);
          }
        } else {
          samplesEarly = input;
        }
        // Apply the same adaptive gain to the PCM sent to ASR so a quiet
        // headset mic reaches the backend at an audible level (the clamp
        // handles any overshoot from the boost).
        const pcmEarly = new Int16Array(samplesEarly.length);
        for (let i = 0; i < samplesEarly.length; i++) {
          pcmEarly[i] = Math.max(-32768, Math.min(32767, samplesEarly[i] * micGain * 32768));
        }

        // While Bina is mid-speech the mic might still be hot — never buffer
        // those frames (they're TTS echo). Otherwise, if speech hasn't been
        // confirmed yet, push into the pre-speech ring so the first word is
        // captured.
        if (!speechDetectedRef.current && !isAiSpeakingRef.current) {
          preSpeechPCMRingRef.current.push(pcmEarly);
          preSpeechPCMSampleCountRef.current += pcmEarly.length;
          while (
            preSpeechPCMSampleCountRef.current > PRE_SPEECH_BUFFER_MAX_SAMPLES &&
            preSpeechPCMRingRef.current.length > 1
          ) {
            const dropped = preSpeechPCMRingRef.current.shift();
            if (dropped) preSpeechPCMSampleCountRef.current -= dropped.length;
          }
        }

        // During warmup period, mic frames are being captured into the ring
        // buffer above. Skip VAD analysis for the warmup window — Bina's TTS
        // echo may still be present and would otherwise falsely trip speech
        // detection. The ring buffer will flush to backend the moment VAD
        // does confirm speech (post-warmup), preserving the warmup-window
        // audio that used to be discarded.
        if (nowMs < vadWarmupUntilRef.current) {
          // …but DO calibrate the ambient noise floor during warmup (when Bina's
          // echo has settled). This gives the floor a head start so it already
          // reflects the room noise the instant the candidate's turn opens —
          // otherwise the first ~300ms of noise could trip the soft gate before
          // the floor catches up. Loud echo is excluded by AMBIENT_LEARN_CAP.
          if (
            !isAiSpeakingRef.current &&
            nowMs >= playbackEchoGuardUntilRef.current &&
            avgLevel < AMBIENT_LEARN_CAP
          ) {
            const rising = avgLevel > ambientNoiseFloorRef.current;
            const a = rising ? 0.08 : 0.12;
            ambientNoiseFloorRef.current =
              ambientNoiseFloorRef.current * (1 - a) + avgLevel * a;
          }
          return;
        }
        // Fix 3 (revised): the echo guard and "Bina still speaking" check
        // must NOT `return` — that drops the PCM send block at the bottom of
        // this function and silently kills candidate audio. Instead, fold
        // them into a flag that gates only NEW speech_started detection. Once
        // speech is in progress, frames keep flowing so the candidate's
        // answer reaches the backend.
        // Suppress new speech detection during ANY Bina speech, including
        // the silence nudge. Per spec: candidate's response must only be
        // captured AFTER "Are you there?" finishes speaking.
        const suppressNewSpeechDetection =
          nowMs < playbackEchoGuardUntilRef.current ||
          isAiSpeakingRef.current;

        // Track the room's baseline mic energy before the candidate starts.
        // The in-turn silence clock later uses this to distinguish quiet speech
        // from constant office / fan noise.
        // Learn the room's noise floor from every non-speech frame below the
        // AMBIENT_LEARN_CAP (which excludes true speech). We intentionally do
        // NOT gate on candidateAudioStreamingRef anymore: background noise can
        // open the soft "possible speech" stream WITHOUT confirming real speech,
        // and if we froze learning there the floor could never catch up to the
        // noise. Asymmetric EMA — rise slowly toward sustained louder noise,
        // fall faster when it quiets — so a brief noise burst doesn't over-
        // inflate the floor but persistent noise IS learned.
        if (
          !speechDetectedRef.current &&
          !suppressNewSpeechDetection &&
          avgLevel < AMBIENT_LEARN_CAP
        ) {
          const rising = avgLevel > ambientNoiseFloorRef.current;
          const a = rising ? 0.05 : 0.10;
          ambientNoiseFloorRef.current =
            ambientNoiseFloorRef.current * (1 - a) + avgLevel * a;
        }

        // OpenAI realtime transcription path: stream the full post-warmup mic
        // feed continuously and let the backend/OpenAI own transcript assembly.
        // This removes the old "wait for browser transcript or local gate
        // first" delay that clipped the candidate's opening words.
        if (
          realtimeTranscriptionEnabledRef.current &&
          !candidateAudioStreamingRef.current &&
          !suppressNewSpeechDetection
        ) {
          candidateAudioStreamingRef.current = true;
          candidateAudioFrameCountRef.current = MIN_POSSIBLE_SPEECH_FRAMES;
          flushPreSpeechAudioToBackend();
          console.log('[INTERVIEW-DEBUG] realtime transcription opened continuous PCM streaming');
        }


        // Soft capture gate: low-gain headset speech can be below the normal
        // VAD threshold. This gate may START PCM streaming earlier, but it must
        // NOT on its own mark the turn as "real speech" or send speech_started —
        // that was causing background office noise to hold the full 2-minute slot
        // open until hard-cap. Real turn ownership still requires either:
        //   1) browser live transcript movement, or
        //   2) the stricter VAD confirmation path below.
        const possibleSpeechThreshold = Math.max(
          POSSIBLE_SPEECH_LEVEL,
          ambientNoiseFloorRef.current * POSSIBLE_SPEECH_NOISE_MULTIPLIER,
          ambientNoiseFloorRef.current + POSSIBLE_SPEECH_MARGIN
        );
        if (
          avgLevel > possibleSpeechThreshold &&
          voiceLike &&
          !candidateAudioStreamingRef.current &&
          !suppressNewSpeechDetection
        ) {
          candidateAudioFrameCountRef.current++;
          if (candidateAudioFrameCountRef.current >= MIN_POSSIBLE_SPEECH_FRAMES) {
            if (!candidateAudioStreamingRef.current) {
              candidateAudioStreamingRef.current = true;
              flushPreSpeechAudioToBackend();
              console.log('[INTERVIEW-DEBUG] soft audio gate opened PCM streaming', {
                avgLevel: Number(avgLevel.toFixed(4)),
                possibleSpeechThreshold: Number(possibleSpeechThreshold.toFixed(4)),
                voiceBandRatio: Number(voiceBandRatio.toFixed(2)),
              });
            }
          }
        } else if (!candidateAudioStreamingRef.current && (avgLevel <= possibleSpeechThreshold || !voiceLike)) {
          candidateAudioFrameCountRef.current = 0;
        }

        const speechConfirmThreshold = Math.max(silenceThresholdRef.current, possibleSpeechThreshold);
        if (!speechDetectedRef.current && avgLevel > speechConfirmThreshold && voiceLike) {
          speechFrameCountRef.current++;
          silenceStartRef.current = null;
          if (speechFrameCountRef.current >= MIN_SPEECH_FRAMES && !suppressNewSpeechDetection) {
            console.log('[INTERVIEW-DEBUG] Speech DETECTED (VAD)', {
              questionTimerSeconds: questionTimerSecondsRef.current,
              questionNumber: questionNumberRef.current,
              preBufferedSamples: preSpeechPCMSampleCountRef.current,
            });
            candidateAudioStreamingRef.current = true;
            speechDetectedRef.current = true;
            speechDetectedAtRef.current = nowMs;
            lastMeaningfulAudioAtRef.current = nowMs;
            speechPeakLevelRef.current = avgLevel;
            // Flush the pre-speech ring buffer to backend so Whisper gets
            // the candidate's FIRST WORDS (the ones spoken during VAD
            // warmup + the 3-frame confirmation delay). Without this flush,
            // Whisper transcribes from mid-sentence and the start of the
            // answer is lost.
            flushPreSpeechAudioToBackend();
            questionTimerAwaitingSpeechRef.current = false;
            if (!speechStartSentRef.current) {
              speechStartSentRef.current = true;
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "speech_started" }));
                console.log('[INTERVIEW-DEBUG] sent speech_started to backend');
              }
            }
            clearNoResponseTimer();
            noResponseRetryRef.current = 0;
          }
        } else {
          if (!speechDetectedRef.current) {
            speechFrameCountRef.current = 0;
          } else {
            const transcriptRecentlyAdvanced =
              lastLiveTranscriptUpdateAtRef.current != null &&
              nowMs - lastLiveTranscriptUpdateAtRef.current < TRANSCRIPT_ACTIVITY_GRACE_MS;
            const transcriptLedTurn =
              turnHasLiveTranscriptRef.current &&
              lastLiveTranscriptUpdateAtRef.current != null;
            const realtimeTranscriptPending =
              realtimeTranscriptionEnabledRef.current && !transcriptLedTurn;
            const realtimeBootstrapActive =
              realtimeTranscriptPending &&
              speechDetectedAtRef.current != null &&
              (nowMs - speechDetectedAtRef.current) < REALTIME_TRANSCRIPT_BOOTSTRAP_GRACE_MS;
            speechPeakLevelRef.current = Math.max(avgLevel, speechPeakLevelRef.current * 0.99);
            // Peak-RELATIVE activity thresholds. The candidate's own close-mic
            // speech is much louder than background people talking in the room
            // (measured: candidate ~0.043 vs far background ~0.012). The old
            // caps (0.0048 / 0.008) held the thresholds BELOW background chatter,
            // so that chatter kept resetting the silence clock and the turn ran
            // to the 2-min cap. Raising the caps lets the threshold scale up with
            // the candidate's own volume (≈0.4–0.55 × their speech peak), so
            // background voices fall BELOW "activity" and the turn ends ~8s after
            // the candidate stops. A genuinely quiet speaker has a low peak, so
            // their threshold stays low too — they are not cut off.
            const inTurnActivityThreshold = Math.max(
              QUIET_SPEECH_ACTIVITY_LEVEL,
              ambientNoiseFloorRef.current * IN_TURN_NOISE_MULTIPLIER,
              ambientNoiseFloorRef.current + IN_TURN_ACTIVITY_MARGIN,
              Math.min(0.016, speechPeakLevelRef.current * 0.42)
            );
            const strongInTurnActivityThreshold = Math.max(
              MIN_STRONG_IN_TURN_LEVEL,
              ambientNoiseFloorRef.current * STRONG_IN_TURN_NOISE_MULTIPLIER,
              ambientNoiseFloorRef.current + STRONG_IN_TURN_ACTIVITY_MARGIN,
              Math.min(0.024, speechPeakLevelRef.current * 0.55)
            );
            // A frame keeps the turn "active" (resets the silence clock) ONLY if
            // it is voice-like — loud background noise / music / hum no longer
            // holds the turn open, which is what let the interview idle to the
            // 2-min hard cap. Live transcript advancing is authoritative and
            // bypasses the voice-band check (ASR already confirmed real words).
            // Is this frame "active" (loud enough + voice-like)? A single active
            // frame is NOT enough to reset the countdown — we require a SUSTAINED
            // run (see SUSTAINED_ACTIVE_MS) so a momentary blip can't restart the
            // 8s clock. Track the unbroken active-streak start here.
            const _frameIsActive = (avgLevel > inTurnActivityThreshold) && voiceLike;
            const _frameIsStrong = (avgLevel > strongInTurnActivityThreshold) && voiceLike;
            if (_frameIsActive) {
              // Start a new streak only if the previous one has fully lapsed
              // (gap since last active frame exceeded the dip grace). A brief
              // inter-word dip keeps the SAME streak alive so it can reach
              // SUSTAINED_ACTIVE_MS instead of restarting from zero every gap.
              const _gapSinceActive = lastActiveFrameAtRef.current == null
                ? Infinity
                : (nowMs - lastActiveFrameAtRef.current);
              if (activeStreakStartRef.current == null || _gapSinceActive > STREAK_DIP_GRACE_MS) {
                activeStreakStartRef.current = nowMs;
              }
              lastActiveFrameAtRef.current = nowMs;
            } else if (
              activeStreakStartRef.current != null &&
              lastActiveFrameAtRef.current != null &&
              (nowMs - lastActiveFrameAtRef.current) > STREAK_DIP_GRACE_MS
            ) {
              // Sub-threshold for longer than the grace window — the speaker
              // has genuinely stopped, so break the streak. Short dips fall
              // through and keep the streak (and _sustained) alive.
              activeStreakStartRef.current = null;
            }
            const _streakMs = activeStreakStartRef.current == null
              ? 0
              : (nowMs - activeStreakStartRef.current);
            const _sustained = _frameIsActive && _streakMs >= SUSTAINED_ACTIVE_MS;

            if (transcriptRecentlyAdvanced) {
              lastMeaningfulAudioAtRef.current = nowMs;
              silenceStartRef.current = null;
              inTurnSpeechFrameCountRef.current = 0;
            } else if (_frameIsStrong && _sustained) {
              // SUSTAINED strong voice — unambiguously real speech (steady mic/BT
              // noise never reaches this level, and a blip never lasts this long).
              // Stamp it so the soft-voice guard below only keeps the turn alive
              // while real speech is recent, and reset the silence clock.
              lastStrongVoiceAtRef.current = nowMs;
              inTurnSpeechFrameCountRef.current++;
              if (!transcriptLedTurn || inTurnSpeechFrameCountRef.current >= MIN_IN_TURN_SPEECH_FRAMES) {
                if (!realtimeTranscriptPending || realtimeBootstrapActive) {
                  lastMeaningfulAudioAtRef.current = nowMs;
                  silenceStartRef.current = null;
                }
              }
            } else if (!transcriptLedTurn && _frameIsActive && _sustained) {
              inTurnSpeechFrameCountRef.current = 0;
              if (!realtimeTranscriptPending || realtimeBootstrapActive) {
                lastMeaningfulAudioAtRef.current = nowMs;
                silenceStartRef.current = null;
              }
            } else {
              inTurnSpeechFrameCountRef.current = 0;
              // Soft-voice guard: if audio is above ambient * 1.5 the candidate
              // is still producing sound — just quieter than the adaptive
              // in-turn threshold. Don't let the silence clock accumulate during
              // live speech; only genuine silence (at/below ambient floor) counts.
              // Without this, a voice consistently below inTurnActivityThreshold
              // accumulates "silence" the whole time it's speaking, and a 2-second
              // breath gap tips the total over silenceDurationMs → premature cut-off.
              const softVoiceFloor = Math.max(POSSIBLE_SPEECH_LEVEL, ambientNoiseFloorRef.current * 1.5);
              // The soft-voice guard keeps the turn alive for quiet TRAILING
              // speech — but ONLY if a strong voice frame occurred recently.
              // Steady mic/Bluetooth self-noise reads "voice-like" and sits just
              // above ambient×1.5 (Realtek: Level≈0.0091 vs floor≈0.0083), so
              // without this it reset the silence clock forever and the 8s
              // end-turn never fired (turn idled to the 2-min cap). A real quiet
              // speaker produces strong frames (word onsets/emphasis) within the
              // window; pure noise never does — so noise now falls through to
              // silence accumulation and the turn ends. Anchor the silence clock
              // to the last strong voice frame so the turn ends the-window after
              // real speech stopped, not the-window after the noise stops.
              const strongSilenceMs = silenceDurationMsRef.current * micSilenceMultiplierRef.current;
              const lastStrong = lastStrongVoiceAtRef.current ?? speechDetectedAtRef.current ?? nowMs;
              const strongVoiceRecent = (nowMs - lastStrong) <= strongSilenceMs;
              if (avgLevel > softVoiceFloor && voiceLike && strongVoiceRecent) {
                lastMeaningfulAudioAtRef.current = nowMs;
                silenceStartRef.current = null;
              } else {
                // Is this frame steady voice-like NOISE holding the turn open
                // (above soft floor, voice-like, but no strong voice for the
                // whole window)? If so, anchor the silence clock to the last
                // STRONG voice frame so the turn ends one window after real
                // speech actually stopped — not perpetually deferred by the
                // noise. Genuine quiet (below soft floor / non-voice) keeps the
                // original lastMeaningfulAudio anchor so a quiet speaker isn't
                // cut early.
                const noiseHoldingTurn =
                  avgLevel > softVoiceFloor && voiceLike && !strongVoiceRecent;
                const silenceSince =
                  noiseHoldingTurn
                    ? lastStrong
                    : transcriptLedTurn
                      ? (lastLiveTranscriptUpdateAtRef.current ?? lastMeaningfulAudioAtRef.current ?? speechDetectedAtRef.current ?? nowMs)
                      : (lastMeaningfulAudioAtRef.current ?? speechDetectedAtRef.current ?? nowMs);
                silenceStartRef.current = silenceSince;
                // (4) Stretch the silence window for quiet/laggy devices
                // (headphones, Bluetooth) so a real answer isn't cut off
                // mid-sentence; built-in mic uses the base value (×1).
                const effectiveSilenceMs = silenceDurationMsRef.current * micSilenceMultiplierRef.current;
                if (nowMs - silenceSince > effectiveSilenceMs) {
                  const speechAgeMs =
                    speechDetectedAtRef.current == null ? 0 : nowMs - speechDetectedAtRef.current;
                  if ((isFlexibleMode || isNewFlexibleMode) && speechAgeMs < 2000) {
                    return;
                  }
                  // Server-side EOT mode: the SERVER (provider EndOfTurn) decides
                  // when the turn ends — the client must not cut on its own silence
                  // timer. Normally we just let the silence clock keep running and
                  // wait for `server_end_turn`. SAFETY NET: if that signal never
                  // arrives and TRUE silence has persisted far beyond when EndOfTurn
                  // should have fired, force-end the turn here so the interview can't
                  // sit idle until the 130 s hard cap (the "answer finished but stays
                  // idle" bug). This threshold is generous so a normal pause is never
                  // pre-empted — it only rescues a genuinely stuck turn.
                  // ── AII14-PARKED: silence NO LONGER ends the turn ──────────
                  // AC3: "The system shall not automatically move to the next
                  // question based only on silence detection." The silence clock
                  // still runs (the confirmation-popup driver reads
                  // silenceStartRef), but neither branch below may call
                  // stopRecording() any more — the candidate ends the turn via
                  // Submit / Next. The per-question hard cap
                  // (question_window_hard_cap) is untouched and remains the
                  // backstop against a turn idling forever.
                  //
                  // Original code preserved verbatim in
                  // ./parked/silence-auto-advance.parked.md — to restore, delete
                  // the log below and un-comment both blocks.
                  //
                  // if (serverEotEnabledRef.current) {
                  //   if (nowMs - silenceSince > SERVER_EOT_SILENCE_FALLBACK_MS) {
                  //     console.warn('[INTERVIEW-DEBUG] server_end_turn missing — silence safety-net force-ending turn', {
                  //       silenceMs: nowMs - silenceSince,
                  //       fallbackMs: SERVER_EOT_SILENCE_FALLBACK_MS,
                  //     });
                  //     stopRecording();
                  //   }
                  //   return;
                  // }
                  // console.log('[INTERVIEW-DEBUG] Silence timeout -> stopRecording', { ... });
                  // stopRecording();
                  // return;
                  if (!silenceHoldLoggedRef.current) {
                    silenceHoldLoggedRef.current = true;
                    console.log('[INTERVIEW-DEBUG] AII14: silence window elapsed — HOLDING turn open (awaiting Submit/Next)', {
                      silenceMs: nowMs - silenceSince,
                      effectiveSilenceMs,
                      serverEot: serverEotEnabledRef.current,
                      // Both thresholds are logged for diagnosis only — neither
                      // ends the turn any more (see AII14-PARKED above).
                      parkedServerEotFallbackMs: SERVER_EOT_SILENCE_FALLBACK_MS,
                    });
                  }
                  return;
                }
              }
            }
          }
        }

        // PCM was already encoded at the top of this function into `pcmEarly`.
        // Once possible speech is detected, forward the full candidate-turn
        // audio continuously. VAD now controls turn timing only; OpenAI gets
        // the quiet headset audio instead of the browser filtering it out.
        const lindaHoldingTurn = isAiSpeakingRef.current;
        if (
          candidateAudioStreamingRef.current &&
          !lindaHoldingTurn &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          // Bug D fix: detect WS back-pressure and surface silent drops.
          // If bufferedAmount grows unbounded, frames stall in the browser
          // and the server gets nothing — same symptom as a dropped send.
          const _bufAmt = wsRef.current.bufferedAmount;
          if (_bufAmt > 5_000_000) {
            // 5 MB buffered = network slower than our send rate. Warn loud
            // and skip this frame so we don't grow the buffer forever.
            const interviewWindow = window as InterviewWindow;
            interviewWindow.__audioFramesDropped = (interviewWindow.__audioFramesDropped || 0) + 1;
            if (interviewWindow.__audioFramesDropped % 25 === 1) {
              console.warn(`[AUDIO-SEND-BACKPRESSURE] bufferedAmount=${_bufAmt} — dropping frame (${interviewWindow.__audioFramesDropped} dropped total)`);
            }
          } else {
            try {
              wsRef.current.send(pcmEarly.buffer);
              const interviewWindow = window as InterviewWindow;
              interviewWindow.__audioFramesSent = (interviewWindow.__audioFramesSent || 0) + 1;
              interviewWindow.__audioBytesSent = (interviewWindow.__audioBytesSent || 0) + pcmEarly.byteLength;
            } catch (sendErr) {
              const interviewWindow = window as InterviewWindow;
              interviewWindow.__audioFramesFailed = (interviewWindow.__audioFramesFailed || 0) + 1;
              console.error(`[AUDIO-SEND-FAILED] send() threw (${interviewWindow.__audioFramesFailed} failures total):`, sendErr);
            }
          }
        }
      };

      // ── AudioWorklet (primary) → ScriptProcessor (fallback) ───────────────
      // AudioWorklet runs off the main thread — no UI jank during recording.
      // ScriptProcessor is deprecated but kept as fallback for older browsers.
      let audioNodeConnected = false;

      // RNNoise was REMOVED (per user request). We keep an off-main-thread
      // PCM chunker worklet: it just forwards mic audio in 4096-sample chunks,
      // NO noise suppression, NO WASM. Off-thread avoids UI jank during
      // recording (the ScriptProcessor fallback below runs on the main thread).
      // Noise handling comes from the browser's built-in noiseSuppression +
      // the mic GAIN boost above — not from a worklet.

      if (ctx.audioWorklet) {
        try {
          // Register the chunker once per AudioContext (addModule again on the
          // same context throws NotSupportedError).
          if (!pcmWorkletRegisteredRef.current) {
            await ctx.audioWorklet.addModule('/workers/pcm-chunker-processor.js');
            pcmWorkletRegisteredRef.current = true;
          }

          const workletNode = new AudioWorkletNode(ctx, 'pcm-chunker', {
            channelCount: 1,
            channelCountMode: 'explicit',
            channelInterpretation: 'discrete',
          });
          workletNode.port.onmessage = (e: MessageEvent) => {
            if (e.data instanceof Float32Array) {
              processAudioChunk(e.data);
            }
          };
          source.connect(workletNode);
          workletNode.connect(ctx.destination);
          processorRef.current = workletNode;
          audioNodeConnected = true;
          console.log('[InterviewUI] AudioWorklet active (pcm-chunker)');
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
      startPendingQuestionTimer("candidate_turn_open");
      // Capture pipeline (mic + worklet) is now live — show the "Your turn"
      // popup + listening state. Same signal for every provider now (no Web
      // Speech onaudiostart dependency).
      turnPipelineReadyRef.current = true;
      markListeningStarted();
      avatarState.onUserStartSpeaking();
      setStatus(`Listening... (auto-stops after ${silenceDurationMsRef.current / 1000}s silence)`);

      // No-response detection — LAST-RESORT fallback ONLY. The BACKEND owns the
      // canonical silence nudge: its ladder fires "Are you there?" at 20s and
      // skips at ~30-35s (WAIT_1 20s + nudge + WAIT_2 10s), then advances the
      // turn (which clears this timer). The client used to ALSO fire at 20s,
      // producing TWO "Are you there?" messages back-to-back (one from each).
      // We now fire only at 45s — well AFTER the backend's whole ladder — so the
      // backend always wins and this client nudge fires only if the backend
      // never responded at all (e.g. silence detection disabled / stuck).
      clearNoResponseTimer();
      noResponseTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && isRecordingRef.current && !isSilencePromptRef.current) {
          handleNoResponseRef.current();
        }
      }, 45000);

      // Hard cap on a single recording segment. Previously this was 30 s in
      // timed mode — which silently cut off candidates who tried to give a
      // continuous 60-120 s answer within their 2-min per-question slot.
      // Symptoms the candidate sees:
      //   * answer-time timer appears to freeze / disappear mid-speech (mic
      //     actually stopped, banner still shows the frozen value)
      //   * ASR returns a partial transcript — only the first 30 s of speech
      //   * "continuously speak for 2 min → UI transcript not full"
      // Raised to 130 s in BOTH modes so the cap always exceeds the 120-s
      // per-question window. The backend's own auto-skip fires at the true
      // window boundary, so this client cap is just a safety net against an
      // infinite stuck recording — it should never be the thing that ends
      // a normal answer.
      const maxRecordingMs = 130000;
      clearMaxRecordingTimer();
      maxRecordingTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log(`[VAD] Max recording duration (${maxRecordingMs}ms) reached — stopping`);
          stopRecording();
        }
      }, maxRecordingMs);
    } catch (err: unknown) {
      // Reset recording flag — we set it early to prevent races; undo on failure.
      isRecordingRef.current = false;
      setIsRecording(false);
      // The Web Speech recognizer is now pre-warmed before this try block, so a
      // mic-acquisition failure here could leave it running with no recording
      // session behind it (its onend/onerror auto-restart guards check
      // isRecordingRef, now false, so it won't loop — but stop it explicitly to
      // release the engine cleanly).
      stopWebSpeechRecognition();
      const errName = getErrorName(err);
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        if (isBraveBrowser) {
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
      console.error('[InterviewUI] Recording microphone capture failed:', err);
    }
  };

  useEffect(() => {
    startRecordingInternalRef.current = () => {
      void startRecordingInternal();
    };
    // ── Pre-turn "get ready" countdown drivers (Change 1) ──────────────────
    cancelPreTurnCountdownRef.current = () => {
      if (preTurnCountdownTimerRef.current) {
        clearInterval(preTurnCountdownTimerRef.current);
        preTurnCountdownTimerRef.current = null;
      }
      if (preTurnCountdownRef.current !== null) {
        preTurnCountdownRef.current = null;
        setPreTurnCountdown(null);
      }
    };
    runPreTurnCountdownRef.current = (onComplete: () => void) => {
      cancelPreTurnCountdownRef.current();
      let n = PRE_TURN_COUNTDOWN_FROM;              // 3 (AII14 AC1)
      preTurnCountdownRef.current = n;
      setPreTurnCountdown(n);
      setStatus("Get ready…");
      preTurnCountdownTimerRef.current = setInterval(() => {
        n -= 1;
        if (n >= 1) {
          // Show 4, 3, 2, 1 — one per second (5 was shown immediately above).
          preTurnCountdownRef.current = n;
          setPreTurnCountdown(n);
        } else {
          // Countdown finished → open the mic / start the answer timer now.
          if (preTurnCountdownTimerRef.current) {
            clearInterval(preTurnCountdownTimerRef.current);
            preTurnCountdownTimerRef.current = null;
          }
          preTurnCountdownRef.current = null;
          setPreTurnCountdown(null);
          try { onComplete(); } catch { /* no-op */ }
        }
      }, 1000);
    };
  });

  // ── AII14: silence → "Are you done?" confirmation driver ───────────────────
  // Polls the VAD's silenceStartRef every 200ms while the candidate's turn is
  // open. Once silence has run CONTINUOUSLY for 15s, raise the confirmation
  // popup. The instant the candidate speaks again the VAD resets
  // silenceStartRef → the popup closes and the 15s window starts over (AC3).
  //
  // Measured against DONE_CONFIRM_SILENCE_MS directly, NOT against the VAD's own
  // silence window: the story fixes this at 15s, while the VAD window is a
  // tuning value that varies per device/deployment (and no longer ends the turn
  // anyway now that the auto-advance is parked).
  //
  // AII14-PARKED: the previous version of this effect drove the 10→1 countdown
  // and is preserved verbatim in ./parked/silence-auto-advance.parked.md
  useEffect(() => {
    if (!isRecording) { setMidSilenceConfirm_(false); setMidSilenceCountdown_(null); return; }
    const id = setInterval(() => {
      if (!isRecordingRef.current || isAiSpeakingRef.current || isProcessingRef.current) {
        setMidSilenceConfirm_(false);
        return;
      }
      const start = silenceStartRef.current;
      if (start == null) {
        // Candidate is speaking (VAD cleared the silence clock) — close the
        // popup and re-arm the one-shot hold log for the NEXT pause (AC3).
        silenceHoldLoggedRef.current = false;
        setMidSilenceConfirm_(false);
        return;
      }
      setMidSilenceConfirm_((Date.now() - start) >= DONE_CONFIRM_SILENCE_MS);
    }, 200);
    return () => {
      clearInterval(id);
      silenceHoldLoggedRef.current = false;
      setMidSilenceConfirm_(false);
    };
  }, [isRecording, setMidSilenceConfirm_, setMidSilenceCountdown_, DONE_CONFIRM_SILENCE_MS]);

  // AII14 AC4 — "Submit": finalize the CURRENT response and move on.
  // stopRecording() is the normal end-of-turn path (the same one the parked
  // auto-advance used), so the answer is transcribed, stored against this
  // question, and the next question follows. Deliberately NOT handleNextQuestion,
  // which is the SKIP path and would discard the answer.
  const handleSubmitResponse = useCallback(() => {
    setMidSilenceConfirm_(false);
    stopRecording();
  }, [setMidSilenceConfirm_, stopRecording]);

  const disconnect = useCallback(() => {
    const wasCompleted = isClosingRef.current || shouldDisconnectAfterAudioRef.current;

    stopVisemeLoop();
    stopRecording();
    clearNoResponseTimer();
    cancelPreTurnCountdownRef.current();
    setMidSilenceCountdown_(null);
    if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }
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
  useEffect(() => {
    disconnectRef.current = disconnect;
  });

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
          startRecordingInternalRef.current();
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
      // First timeout: Bina asks "Are you there?"
      stopRecordingSilent();
      noResponseRetryRef.current = 1;

      const areYouThereMsg = "Are you there? I didn't hear a response.";
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: areYouThereMsg,
      }]);

      setStatus("Bina is speaking...");

      // Mark this as a silence prompt so the question timer keeps ticking
      // while Bina asks "Are you there?" (her speaking time counts against
      // the candidate's answer window). Auto-reset at line 569 when speaking ends.
      isSilencePromptRef.current = true;

      speakViaTTS(areYouThereMsg, () => {
        setIsClarification(false);
      setStatus("Your turn - speak now...");
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            startRecordingInternalRef.current();
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
  }, [handleMicPopupNo, speakViaTTS, stopRecordingSilent]);

  // Keep refs in sync with latest callbacks
  useEffect(() => {
    handleNoResponseRef.current = handleNoResponse;
  }, [handleNoResponse]);
  useEffect(() => {
    stopRecordingSilentRef.current = stopRecordingSilent;
  }, [stopRecordingSilent]);
  useEffect(() => {
    abortRecordingForSkipRef.current = abortRecordingForSkip;
  }, [abortRecordingForSkip]);

  // WebSocket connection
  const connect = useCallback(() => {
    // Audio playback is handled by TalkingHead (gain:1) — no AudioContext needed here.

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') || 'localhost:8000';
    // Send the browser's stable client id so the interview INHERITS the same
    // single-active-session lease the pre-interview flow held (otherwise the
    // candidate would block themselves at the interview). A different browser
    // has a different cid → blocked.
    const _cid = encodeURIComponent(getAiClientSessionId(token));
    const wsUrl = `${protocol}//${apiUrl}/api/v1/ws/ai-interview/${token}?cid=${_cid}`;

    console.log('[IV-DIAG] connect() called', {
      wsUrl,
      nodeEnv: process.env.NODE_ENV,
      avatarReady,
      avatarFailed,
      hasConnectedBefore: hasConnectedRef.current,
      ts: new Date().toISOString(),
    });

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    console.log('[IV-DIAG] WebSocket object created, readyState=', ws.readyState);

    ws.onopen = () => {
      const timestamp = new Date().toISOString();
      console.log(`[IV-DIAG] WS OPEN (handshake completed) ts=${timestamp}`);
      console.log(`[WS ${timestamp}] WebSocket connected successfully`);
      setIsConnected(true);
      // Immediate feedback so the candidate sees SOMETHING while the backend's
      // LLM greeting + TTS warms up (can take 2-4s). Without this the chat
      // sits blank and the candidate thinks the page is frozen — which is
      // exactly the "first message appears late" complaint.
      setStatus("Bina is joining your interview...");
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);
      reconnectAttemptsRef.current = 0;
      preStartRetryRef.current = 0; // connected → reset the pre-start race counter
      // A dropped/reconnected WS is exactly when an environment-verification
      // push (opened/recording_started/submitted) could have been missed —
      // reconcile against the backend's authoritative status immediately
      // rather than waiting for the next 2s poll tick. No-ops if no
      // verification is currently active.
      void reconcileEnvVerificationRef.current();
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
      console.log(`[IV-DIAG] WS CLOSE code=${event.code} reason="${event.reason}" wasClean=${event.wasClean} ts=${timestamp}`);
      console.log(`[WS ${timestamp}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
      // Explicit, forwarded diagnostic line (the [INTERVIEW-DEBUG] prefix is on
      // the client-log allowlist) so a WebSocket drop is unmistakable in the
      // journald-forwarded logs — code 1006=abnormal/network, 1012=service
      // restart, 1001=tab closed, 1000=normal. Flush it immediately (beacon)
      // since the socket is already gone and the page may be tearing down.
      // Level matters for triage: an intentional end-of-interview close (1000 +
      // wasClean) is the happy path and logging it as a warning trains everyone
      // to ignore warnings here. Anything else keeps warn.
      const cleanFinish = event.code === 1000 && event.wasClean;
      const logClose = cleanFinish ? console.log : console.warn;
      logClose(`[INTERVIEW-DEBUG] WebSocket closed code=${event.code} reason="${event.reason || ''}" wasClean=${event.wasClean} qNum=${questionNumberRef.current ?? '?'} isClosing=${isClosingRef.current} recording=${isRecordingRef.current}`);
      flushClientLogBeacon();
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
      } else if (event.code === 4003 && /not in progress|not yet|system_check|status:/i.test(event.reason || "")) {
        // RACE: the WS connected BEFORE the candidate's /start call flipped the
        // interview to in_progress (backend reject: "Interview not in progress
        // (status: system_check)"). This is transient — /start completes within
        // ~1-3s — so retry quickly instead of treating it as terminal. Without
        // this the candidate had to manually REFRESH for Bina to start. We keep
        // a dedicated fast counter (short backoff) separate from the network
        // reconnect budget.
        if (preStartRetryRef.current < PRE_START_MAX_RETRIES && !isUnmountedRef.current && !isClosingRef.current) {
          preStartRetryRef.current++;
          const delay = Math.min(1500, 400 + preStartRetryRef.current * 150); // 550ms → 1.5s
          console.log(`[IV-DIAG] WS rejected (not in progress yet) — fast retry ${preStartRetryRef.current}/${PRE_START_MAX_RETRIES} in ${delay}ms`);
          setStatus("Starting your interview...");
          setTimeout(() => {
            if (!isUnmountedRef.current && !isClosingRef.current) connectRef.current();
          }, delay);
        } else {
          setStatus("Could not start the interview. Please refresh the page.");
        }
      } else if (event.code === 4003) {
        // Genuine terminal reject — interview already finalized (recruiter ended
        // it, or grace-period reaper fired). Retrying hits the same wall.
        setStatus("Interview has ended. " + (event.reason || ""));
        uploadRecording().catch(() => {});
      } else if (event.code === 4409 || concurrentBlockedRef.current) {
        // Single-active-session guard: this link is already open/active in
        // another window/device. TERMINAL — never auto-reconnect (it would just
        // be blocked again). The overlay (concurrentBlocked) shows the message.
        concurrentBlockedRef.current = true;
        setConcurrentBlocked(true);
        setStatus(event.reason || "This interview is already open in another window or device.");
      } else if (event.code !== 3001 && !isUnmountedRef.current && !isClosingRef.current) {
        // Unexpected disconnection (tab switch, network glitch) — auto-reconnect
        flushProctoringEventsRef.current?.().catch(() => {});
        stopRecordingSilentRef.current();
        if (reconnectAttemptsRef.current < 10) {
          reconnectAttemptsRef.current++;
          // Exponential backoff: 2s, 3s, 5s, 8s, 13s, 20s, 30s, 30s, 30s, 30s
          // Total budget ~3 min — matches the 5-min server grace window so the
          // candidate has multiple recovery chances before the reaper fires.
          const delays = [2000, 3000, 5000, 8000, 13000, 20000, 30000, 30000, 30000, 30000];
          const delay = delays[Math.min(reconnectAttemptsRef.current - 1, delays.length - 1)];
          setStatus(`Connection lost — reconnecting in ${Math.round(delay / 1000)}s... (attempt ${reconnectAttemptsRef.current}/10)`);
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
      console.error(`[IV-DIAG] WS ERROR ts=${timestamp} readyState=${ws.readyState}`, error);
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
        } else if (talkingHeadEndedEarlyRef.current) {
          // Recovery path: TalkingHead's worklet ended early (buffer drained
          // during a streaming hiccup) but new chunks are still arriving.
          // Restart the worklet so this chunk plays instead of being lost.
          // Without this, Bina's voice cuts off mid-sentence and the rest
          // of the audio is silent.
          console.log("[TalkingHead] re-arming streamStart after early end — chunk arrived");
          talkingHeadEndedEarlyRef.current = false;
          talkingHeadRef.current?.streamStart(24000, () => {
            console.log("[TalkingHead] re-armed playback-ended callback fired");
          });
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
  }, [avatarReady]);

  // Fix #2: visual fallback. If the 3D avatar hasn't signalled ready within 12s
  // (it normally loads in 2-5s), assume it's failed/hung on this device and show
  // the static Bina image so the candidate isn't staring at a blank canvas.
  // The TalkingHead onFallback callback also sets this immediately on a hard
  // error; this timer covers the silent-hang case where no error is thrown.
  useEffect(() => {
    if (avatarReady || avatarFailed) return;
    const t = setTimeout(() => {
      if (!avatarReady) {
        console.warn('[InterviewUI] 3D avatar slow/failed to load — showing static Bina fallback');
        setAvatarFailed(true);
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [avatarReady, avatarFailed]);

  // [IV-DIAG] log avatar readiness transitions — tells us whether the avatar
  // (the heaviest client component) is what's blocking the connect trigger.
  useEffect(() => {
    console.log(`[IV-DIAG] avatarReady=${avatarReady} avatarFailed=${avatarFailed} ts=${new Date().toISOString()}`);
  }, [avatarReady, avatarFailed]);

  // ── AudioContext unlock safety-net ────────────────────────────────────────
  // Chrome's autoplay policy can leave the shared 24kHz AudioContext SUSPENDED
  // (especially on the resume entry-path, where it's created outside a gesture).
  // A suspended context = Bina's TTS never plays → "she only speaks after a
  // refresh". This installs a one-time listener that resumes the context on the
  // candidate's FIRST interaction (pointer/key/touch) with the interview screen,
  // guaranteeing it's 'running' before/at Bina's first audio. Self-removes once
  // resumed. Polls briefly too, in case the context is created slightly later.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let done = false;
    const tryResume = () => {
      const ctx = (window as InterviewWindow).__interviewAudioContext as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(
          () => console.log('[IV-DIAG] AudioContext resumed via gesture, state:', ctx.state),
          () => { /* ignore — will retry on next gesture */ },
        );
      }
      if (ctx && ctx.state === 'running') {
        done = true;
        window.removeEventListener('pointerdown', tryResume);
        window.removeEventListener('keydown', tryResume);
        window.removeEventListener('touchstart', tryResume);
      }
    };
    window.addEventListener('pointerdown', tryResume);
    window.addEventListener('keydown', tryResume);
    window.addEventListener('touchstart', tryResume);
    // Also attempt immediately + a few times early (covers the case where the
    // context was already unlocked by the start-button gesture).
    tryResume();
    const iv = setInterval(() => { if (done) { clearInterval(iv); return; } tryResume(); }, 500);
    const stop = setTimeout(() => clearInterval(iv), 10000);
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
      window.removeEventListener('pointerdown', tryResume);
      window.removeEventListener('keydown', tryResume);
      window.removeEventListener('touchstart', tryResume);
    };
  }, []);

  // Low-tier device → skip waiting on the heavy 3D avatar: show the static
  // Bina image immediately and let the interview connect right away (audio
  // still routes through the mounted TalkingHead). On capable devices the 3D
  // avatar loads normally.
  useEffect(() => {
    if (effectiveDeviceCapability && effectiveDeviceCapability.use3DAvatar === false) {
      setAvatarFailed(true);
    }
  }, [effectiveDeviceCapability]);

  // Connect once the avatar is ready OR has fallen back to the static image.
  // Previously this fired only on avatarReady — so on a low-end machine where
  // the 3D avatar hangs past the 12s timeout (→ avatarFailed), the WebSocket
  // never connected and the interview silently never started. Gating on
  // avatarFailed too means a slow/failed avatar still launches the interview
  // (audio + static visual), which is exactly the old-system case.
  useEffect(() => {
    if ((!avatarReady && !avatarFailed) || hasConnectedRef.current) return;
    console.log('[IV-DIAG] connect-trigger effect firing', {
      avatarReady, avatarFailed,
      deviceTier: effectiveDeviceCapability?.tier ?? 'none',
      cores: effectiveDeviceCapability?.cores ?? 'n/a',
      benchmarkMs: effectiveDeviceCapability?.benchmarkMs ?? 'n/a',
      use3DAvatar: effectiveDeviceCapability?.use3DAvatar ?? 'n/a',
      nodeEnv: process.env.NODE_ENV,
      ts: new Date().toISOString(),
    });
    hasConnectedRef.current = true;
    isUnmountedRef.current = false;
    // Use connectRef (always points at the latest connect) and DO NOT depend on
    // `connect` here. BUG (stuck "Connecting"): when `connect`'s identity changed
    // within the 300ms window, this effect re-ran → its cleanup cleared the timer
    // → on re-entry hasConnectedRef was already true → early return → connect()
    // NEVER fired. Removing `connect` from deps means only avatarReady/avatarFailed
    // can re-run this, so the timer can't be cancelled by a connect-identity change.
    const timer = setTimeout(() => { connectRef.current?.(); }, 300);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarReady, avatarFailed]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
      if (repeatWindowTimerRef.current) { clearTimeout(repeatWindowTimerRef.current); repeatWindowTimerRef.current = null; }
      if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
      if (playbackCompleteSignalRef.current) { clearTimeout(playbackCompleteSignalRef.current); playbackCompleteSignalRef.current = null; }
      if (checkpointTimerRef.current) { clearInterval(checkpointTimerRef.current); checkpointTimerRef.current = null; }
      // Flush the candidate webcam recording BEFORE tearing down media. When the
      // interview is terminated (proctoring), the portal unmounts this component
      // and the WS closes with code 3001 — a path the onclose handler skips, so
      // without this the candidate-camera recording was never uploaded (only the
      // screen recording was). Guarded by isFinalizingUploadRef so a normal
      // completion (which already uploaded via the WS-close 1000 path) does not
      // upload a second time. Fire-and-forget: the SPA stays mounted on the
      // terminated/completed screen, so the in-flight fetch completes.
      if (!isFinalizingUploadRef.current) {
        try { void uploadRecordingRef.current?.(); } catch { /* best effort */ }
      }
      wsRef.current?.close(3001, 'Component unmounted');
      try { audioContextRef.current?.close(); } catch {}
      audioContextRef.current = null;
      try { recordingContextRef.current?.close(); } catch {}
      recordingContextRef.current = null;
      teardownRecordingMedia();
    };
  }, [teardownRecordingMedia]);

  // Auto-scroll — WhatsApp-style: ALWAYS pin the view to the true bottom so the
  // newest question / response / recording bubble is visible. We set scrollTop =
  // scrollHeight directly (instant, no smooth animation) rather than
  // scrollIntoView, for two reasons:
  //   1) instant = no stacked scroll animations → no flicker (the earlier
  //      smooth-scroll-on-every-change caused the "jumps to page end" jitter),
  //   2) scrollHeight accounts for the reserved bottom padding (pb-52) that
  //      keeps the last message clear of the floating banner — so the newest
  //      content lands ABOVE the banner instead of hidden behind it.
  // Layout-affecting states (banners, isRecording, isAiSpeaking, isProcessing)
  // are dependencies too: when the banner appears the padding grows, and we
  // must re-pin so the last message isn't left tucked behind the banner (the
  // bug in image copy 2 where Q3 + the recording bubble were cut off).
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    // rAF so the scroll runs after the DOM has laid out the new content/padding.
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [
    messages, currentAiText, currentTranscript, isCandidateTranscriptProcessing,
    isRecording, isAiSpeaking, isProcessing, questionNumber, isClosing,
    showNowSpeakBanner, showSilenceBanner, questionTimerExpired,
    // Re-pin to the bottom when a countdown overlay appears/disappears (it toggles
    // the reserved bottom padding via bannerVisible).
    preTurnCountdown, midSilenceCountdown,
  ]);

  // Flush proctoring events when the page is about to close (tab close, refresh, etc.)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Fire-and-forget: sendBeacon is best effort but survives page close
      // candidateAIInterviewService uses unauthenticated token-based URLs, so no auth header needed
      flushProctoringEventsRef.current?.().catch(() => {});
      // Beacon the buffered browser diagnostic lines too, so the last moments
      // (incl. a WebSocket drop) reach journald even as the page tears down.
      flushClientLogBeacon();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // Client-log forwarder: ship the browser's interview diagnostic console lines
  // (VAD / silence / stopRecording / mic / WebSocket-close) to the backend so
  // they land in journald tagged `[ai-<token8>]` — readable alongside the
  // backend logs via `grep`. Started once the token is known; flushed + stopped
  // on unmount. See clientLogForwarder.ts (allowlisted, PII-guarded, batched).
  useEffect(() => {
    if (!token) return;
    startClientLogForwarder(token);
    return () => { stopClientLogForwarder(); };
  }, [token]);

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
  //   - `mediaStreamRef` is the per-turn answer-capture stream (audio only,
  //     dedicated when possible, shared-webcam fallback otherwise). Checking
  //     getVideoTracks()
  //     against that stream always reports `length === 0` → false positive
  //     "camera revoked" after every Bina turn ended.
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
      const perms = navigator.permissions;
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
  const armMediaBlock = useCallback((result: NonNullable<typeof mediaBlocked>, extraDetails?: ProctorEventDetails) => {
    if (mediaBlockedRef.current) return; // already armed — idempotent
    console.log('[INTERVIEW-DEBUG] MIC FORCE-MUTED by armMediaBlock', { kind: result.kind, details: extraDetails });
    mediaBlockedRef.current = result;
    setMediaBlocked(result);
    setStatus("Camera / microphone access is required to continue.");
    // User spec: NEVER auto-mute the mic, regardless of media-block state.
    // (Previously the code force-muted on permission denial — but the user
    // wants the mic to stay open in all scenarios so they don't have to
    // manually re-unmute after each pause/permission event.)
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
  // BEFORE the interview UI mounted is caught before Bina even speaks.
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
      // KEEP-RUNNING POLICY (2026-05-26): fullscreen exit must NOT pause or
      // freeze the interview — it now behaves like a tab switch (see
      // handleVisibilityChange below): the timer keeps ticking and Bina keeps
      // going; time spent outside fullscreen is the candidate's penalty.
      //
      // The OLD code froze the timers + stopped TTS + sent session_pause here,
      // but the BACKEND ignores session_pause(reason=fullscreen_exit) ("non-stop"
      // rule, ai_interview_ws.py). That desynced the two sides: the backend kept
      // ticking, expired the window, advanced, and emitted a fresh full-window
      // question_timer_started that reset the visible timer to the start ("timer
      // starts from 1st"). Removing the freeze keeps the frontend in lockstep
      // with the backend's wall-clock truth. After the grace window we only
      // ESCALATE the proctoring record — no freeze, no TTS stop, no session_pause.
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'fullscreen_exit',
        severity: 'minor',
        details: { reason: 'grace_expired', escalated_at: new Date().toISOString() },
      }).catch(() => { /* best-effort */ });
      console.log('[INTERVIEW-DEBUG] Fullscreen-exit grace expired — interview continues (keep-running policy, no freeze)');
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
        // Only resume the backend if we actually hard-paused it. Under the
        // keep-running policy fullscreen exit never pauses (pauseDurationMs
        // stays null), so there is nothing to resume — sending session_resume
        // would make the backend needlessly rebuild the question-timer task and
        // could double-arm the auto-skip.
        if (pauseDurationMs !== null && wsRef.current?.readyState === WebSocket.OPEN) {
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

    // Visibility-change handler: when the candidate switches tabs / minimizes
    // the window, we LOG the violation but do NOT pause the timer or trigger
    // the grace-period / hard-pause path. Rationale: timer must keep ticking
    // through tab switches (cheating attempts cost the candidate their
    // remaining question time as a penalty). Fullscreen exit (Esc/F11) is
    // handled separately by `handleFullscreenChange` and still pauses.
    const handleVisibilityChange = async () => {
      if (!isConnected) return;
      if (document.hidden) {
        // Fire-and-forget violation log; do not gate UI on the result.
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'window_blur',
          severity: 'low',
          details: {
            phase: 'in_interview',
            reason: 'window_hidden',
            timer_paused: false,
          },
        }).catch(() => { /* best-effort */ });
      }
    };

    document.addEventListener(getFullscreenChangeEvent(), handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener(getFullscreenChangeEvent(), handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  const candidateLiveTranscriptEnabled =
    backendLiveTranscriptEnabled || browserSpeechRecognitionSupported;

  // ── Candidate turn state + action buttons ──────────────────────────────
  // It's the candidate's turn to answer when Bina has fully finished speaking
  // AND the answer timer is open. Drives the RED↔GREEN turn banner and gates the
  // Repeat/Next action buttons (they must NOT show while Bina is speaking).
  const isCandidateTurn =
    isConnected && !isClosing &&
    !isAiSpeaking && !isProcessing &&
    questionTimerSeconds !== null && !questionTimerExpired;

  // Post a candidate-initiated action into the chat as a distinct chip. Tagged
  // isActionRequest so the answer-transcript logic never overwrites it. Returns
  // the new message id so callers can later remove it (e.g. drop the "moved on"
  // chip if the candidate actually spoke and a real transcript lands).
  const postCandidateActionMessage = (content: string): string => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id,
      role: "user" as const,
      content,
      timestamp: nowIST(),
      isActionRequest: true,
    }]);
    return id;
  };

  // "Next" — record any partial answer, then ask the backend for the next
  // question. Ported verbatim from the old bottom-bar Next-Q button; the only
  // addition is the candidate action chip posted to the chat.
  const handleNextQuestion = () => {
    if (questionTimerExpired) return;
    // Disable on last question — candidate must answer the final Q, not skip it.
    if (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) return;
    if (nextSkipInFlightRef.current) return;
    if (isAiSpeakingRef.current && questionTimerSeconds === null) return;

    nextSkipInFlightRef.current = true;
    setNextSkipInFlight(true);
    setTimeout(() => {
      if (nextSkipInFlightRef.current) {
        nextSkipInFlightRef.current = false;
        setNextSkipInFlight(false);
      }
    }, 15000);

    const skipBrowserTranscript = backendLiveTranscriptEnabled ? "" : snapshotVisibleLiveTranscript();
    const hadSpeechForSkip = speechDetectedRef.current;

    // Chat: ALWAYS post the "move on" chip so the Next click is visible (the
    // earlier version suppressed it whenever speechDetectedRef was true, which
    // background people/noise set even when the candidate never really spoke —
    // so a genuine skip showed NOTHING). We keep the id: if the candidate DID
    // speak and a real transcript lands for this question, the transcript-final
    // handler removes this chip so it's not shown on top of their answer.
    skipChipIdRef.current = postCandidateActionMessage("Let's move on to the next question.");

    // 0. If Bina is speaking, stop her immediately.
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

    // 1. Stop mic silently — no end_turn, no processing state.
    abortRecordingForSkipRef.current();

    // 1b. If the candidate spoke, show the loading bubble right away.
    if (hadSpeechForSkip) {
      setCurrentTranscript("");
      currentTranscriptRef.current = "";
      setIsCandidateTranscriptProcessing(true);
    }

    clearNoResponseTimer();
    setIsProcessing(false);
    isProcessingRef.current = false;
    audioEndReceivedRef.current = false;
    if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
    if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }

    setStatus("Bina is preparing the next question...");
    setIsFollowUp(false);

    // Optimistically clear active-skill highlight so the coverage panel doesn't freeze.
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

    if (showSilenceBanner) {
      setShowSilenceBanner(false);
      if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'skip_question',
        source: 'candidate',
        browser_transcript: skipBrowserTranscript || undefined,
      }));
    }

    if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
    questionTimerPendingRef.current = null;
    questionTimerReceivedAtRef.current = null;
    questionTimerSecondsRef.current = null;
    setQuestionTimerSeconds(null);
    setQuestionTimerExpired(false);
    questionTimerExpiredRef.current = false;
  };

  // "Repeat Question" — ask Bina to re-read the CURRENT question. The backend
  // re-speaks WITHOUT advancing the slot or incrementing the question count.
  const handleRepeatQuestion = () => {
    if (repeatInFlightRef.current) return;
    // Only allowed within the early VAD window of the turn (see canRepeat).
    if (!canRepeat) return;
    if (isAiSpeakingRef.current || isProcessingRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    // Most recent question Bina asked (last non-action assistant bubble).
    let lastQuestion = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.isActionRequest && m.content.trim()) {
        lastQuestion = m.content.trim();
        break;
      }
    }
    if (!lastQuestion) return;

    repeatInFlightRef.current = true;
    setRepeatInFlight(true);
    setTimeout(() => {
      if (repeatInFlightRef.current) {
        repeatInFlightRef.current = false;
        setRepeatInFlight(false);
      }
    }, 20000);

    // ── FREEZE the answer timer during the re-speak ──
    // Snapshot the current remaining seconds and stop the ticking interval now.
    // The re-speak's question_timer_started (fired by on_speaking_done on the
    // backend) is intercepted in that handler to RESUME from this frozen value
    // instead of resetting to a full window — so hearing the question again
    // never costs the candidate any of their answer time.
    repeatFrozenRemainingRef.current = questionTimerSecondsRef.current;
    repeatFreezeRef.current = true;
    if (questionTimerIntervalRef.current) {
      clearInterval(questionTimerIntervalRef.current);
      questionTimerIntervalRef.current = null;
    }
    // The candidate has used their one repeat window for this turn — close it
    // and mark it used so the re-speak's timer resume doesn't re-arm it.
    repeatUsedThisTurnRef.current = true;
    setCanRepeat(false);
    if (repeatWindowTimerRef.current) { clearTimeout(repeatWindowTimerRef.current); repeatWindowTimerRef.current = null; }

    // CRITICAL: stop the mic SILENTLY right now (no end_turn), exactly like the
    // Next button does. The mic is still live at this moment, and if we leave it
    // running the VAD silence clock can fire stopRecording() → end_turn while
    // Bina is re-speaking. That queued end_turn is then processed the instant
    // the re-speak finishes → the backend records an (empty) answer and ADVANCES
    // to the next question WITHOUT waiting for the candidate — the reported bug.
    // The mic re-opens for the real answer after the re-speak's audio_end
    // (handleAllAudioFinished → startRecording), so nothing is lost.
    abortRecordingForSkipRef.current();

    // Chat: the candidate's repeat request.
    postCandidateActionMessage("Could you please repeat the question?");
    setStatus("Bina will repeat the question...");

    // The incoming speaking_started (from the backend re-speak) flips the banner
    // to RED; audio_end then re-opens the mic for the candidate's answer.
    wsRef.current.send(JSON.stringify({ type: 'repeat_question', text: lastQuestion }));
  };

  // ── Turn banner (modern, chat-panel-centred) ───────────────────────────
  // ONE banner that morphs between states. Rendered INSIDE the chat scroll
  // wrapper (see {turnBanner} below) as an absolute, chat-centred element — so
  // it sits in the middle of the chat window and never overlaps the candidate
  // video. Gradient + frosted-glass styling; exactly one state shows.
  const turnBanner = (() => {
    // The big pre-turn "get ready" countdown owns the screen — suppress the small
    // banner while it runs so we don't show two "getting ready" messages at once.
    if (preTurnCountdown != null) return null;
    let variant: 'silence' | 'timesup' | 'hold' | 'turn' | 'prepare' | null = null;
    if (showSilenceBanner) variant = 'silence';
    else if (questionTimerExpired) variant = 'timesup';
    else if (isAiSpeaking) variant = 'hold';                 // ONLY while actually speaking
    else if (showNowSpeakBanner && candidatePlaybackEnded) variant = 'turn';
    else if (isProcessing || isCandidateTranscriptProcessing || (isConnected && !isClosing && questionNumber !== null)) variant = 'prepare';
    if (!variant) return null;

    const micIcon = (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" />
        <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" />
      </svg>
    );
    const pauseIcon = (
      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    );
    const spinnerIcon = (
      <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
    const cfg = {
      turn:    { grad: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-200/60', glow: 'shadow-emerald-500/30', title: 'Your turn — speak now',        subtitle: 'Microphone is active · Bina is listening',          icon: micIcon,      dismissible: false },
      hold:    { grad: 'from-rose-500 to-red-600',     ring: 'ring-rose-200/50',    glow: 'shadow-red-600/30',     title: 'Hold on — Bina is speaking',  subtitle: 'Please wait until she finishes the question',        icon: pauseIcon,    dismissible: false },
      prepare: { grad: 'from-rose-500 to-red-600',     ring: 'ring-rose-200/50',    glow: 'shadow-red-600/30',     title: 'Hold on — getting ready',      subtitle: 'Please wait a moment…',                              icon: spinnerIcon,  dismissible: false },
      timesup: { grad: 'from-rose-500 to-red-600',     ring: 'ring-rose-200/50',    glow: 'shadow-red-600/30',     title: "Time's up!",                   subtitle: 'Moving to the next question…',                       icon: <Clock className="w-5 h-5 text-white" />, dismissible: false },
      silence: { grad: 'from-amber-400 to-orange-500', ring: 'ring-amber-200/60',   glow: 'shadow-amber-500/30',   title: 'Are you still there?',         subtitle: 'Take your time — Bina will move on if there’s no response.', icon: micIcon, dismissible: true },
    }[variant];

    return (
      <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className={`pointer-events-auto relative flex items-center gap-3 pl-3 pr-4 py-3 rounded-2xl bg-gradient-to-br ${cfg.grad} ring-1 ${cfg.ring} shadow-2xl ${cfg.glow} backdrop-blur-md min-w-[260px] max-w-[94%] overflow-hidden`}>
          {/* top sheen for a glassy, modern finish */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
          {/* icon in a frosted circle with a soft pulse ring */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/25 ring-1 ring-white/40 backdrop-blur flex items-center justify-center shadow-inner">
              {cfg.icon}
            </div>
            <span className="absolute inset-0 rounded-full ring-2 ring-white/50 animate-ping opacity-40" />
          </div>
          {/* text */}
          <div className="relative min-w-0 flex-1">
            <span className="text-white font-bold block leading-tight tracking-tight drop-shadow-sm" style={{ fontSize: 15 }}>{cfg.title}</span>
            <span className="text-white/85 text-[11px] leading-snug block">{cfg.subtitle}</span>
          </div>
          {cfg.dismissible && (
            <button
              type="button"
              onClick={() => {
                setShowSilenceBanner(false);
                if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
              }}
              className="relative shrink-0 -mr-1 w-6 h-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 text-lg leading-none transition-colors"
              aria-label="Dismiss"
            >×</button>
          )}
        </div>
      </div>
    );
  })();

  // Whether the turn banner is on screen right now — the chat's bottom padding
  // is tied to THIS (not a separate condition) so content is ALWAYS cleared
  // above the banner, including during the "Ending…" closing state where the
  // goodbye message + loading bubble were previously rendering behind it.
  // Keep the reserved bottom padding stable while a big countdown overlay is up,
  // even though turnBanner is suppressed then — otherwise the padding collapses
  // (pb-52→pb-4), scrollHeight drops ~192px and the chat un-pins from the bottom
  // (reported: "auto scroll at bottom not working" during the countdown).
  const bannerVisible = turnBanner !== null || preTurnCountdown != null || midSilenceCountdown != null || midSilenceConfirm;

  return (
    <>
      {/* ── Concurrent-session blocked overlay (single-active-session guard) ── */}
      {concurrentBlocked && (
        <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-[95vw] sm:max-w-md text-center shadow-2xl">
            <div className="text-amber-400 text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-white mb-2">Interview already open elsewhere</h2>
            <p className="text-gray-300 mb-6 text-sm leading-relaxed">
              {status && !status.startsWith('Connection')
                ? status
                : 'This interview link is already open in another window or device. Please continue there. If you just closed it, wait a few seconds and reopen this link.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 transition-colors"
            >
              Reload &amp; try again
            </button>
          </div>
        </div>
      )}
      {/* ── Connection lost overlay ── */}
      {!isConnected && !isClosing && status.startsWith('Connection lost') && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500 rounded-2xl p-8 max-w-[95vw] sm:max-w-md text-center shadow-2xl">
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

      {/* ── Proctoring: Face not in frame overlay ── */}
      {isConnected && isFaceBlocked && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-[95vw] sm:max-w-md text-center shadow-2xl">
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
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-[95vw] sm:max-w-md text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="text-amber-500 text-5xl mb-4">🎤</div>
            <h2 className="text-xl font-bold text-white mb-2">Microphone Issue?</h2>
            <p className="text-gray-400 mb-3">We couldn&apos;t detect any audio. Is your microphone working?</p>
            {isBraveBrowser && (
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

      {/* Turn/silence banner moved INTO the chat panel (rendered as `turnBanner`
          inside the chat scroll wrapper) so it centers within the chat window
          and never overlaps the candidate video. See the {turnBanner} render
          below the chat messages. */}

      {/* ── Interview completion modal (Req 16) ── */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#0A1020] border border-[#10B981]/30 rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#10B981]/15 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white font-bold mb-3" style={{ fontSize: 20 }}>
              {closingReason === "candidate_ended" ? "Interview Ended" : "Interview Complete"}
            </h2>
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

      {/* ── DEV DEBUG OVERLAY — draggable, opt-in only (?debug=1 or dev build) ── */}
      {devMonitorEnabled && (
      <div
        className="fixed z-[999] font-mono text-[10px] select-none"
        style={{ left: debugPos.x, top: debugPos.y, minWidth: 230, maxWidth: 260 }}
      >
        <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: 'rgba(8,8,20,0.93)', border: '1px solid rgba(99,102,241,0.55)', backdropFilter: 'blur(8px)' }}>
          {/* Drag handle + collapse */}
          <div
            className="flex items-center justify-between px-3 py-1.5 cursor-grab active:cursor-grabbing"
            style={{ background: 'rgba(99,102,241,0.22)', borderBottom: debugOpen ? '1px solid rgba(99,102,241,0.3)' : 'none', touchAction: 'none' }}
            onPointerDown={_dbgOnPointerDown}
            onPointerMove={_dbgOnPointerMove}
            onPointerUp={_dbgOnPointerUp}
          >
            <span className="text-indigo-300 font-bold tracking-wider text-[9px]">⠿ DEV MONITOR</span>
            <button
              className="text-indigo-400 hover:text-white px-1 text-[10px]"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setDebugOpen(o => !o)}
            >{debugOpen ? '▲' : '▼'}</button>
          </div>

          {debugOpen && (() => {
            const silenceSec = debugStats.silenceSince != null
              ? ((Date.now() - debugStats.silenceSince) / 1000).toFixed(1) : null;
            const silenceLimit = (debugStats.silenceDurationMs / 1000).toFixed(1);
            const wsColor = debugStats.wsState === 'OPEN' ? '#34d399' : debugStats.wsState === 'CONNECTING' ? '#fbbf24' : '#f87171';
            const levelPct = Math.min(100, (debugStats.avgLevel / Math.max(debugStats.silenceThresh * 3, 0.001)) * 100);
            const sysRamPct = debugStats.sysRamTotal > 0 ? (debugStats.sysRamUsed / debugStats.sysRamTotal) * 100 : 0;
            const jsHeapPct = debugStats.heapTotal > 0 ? (debugStats.heapUsed / debugStats.heapTotal) * 100 : 0;

            return (
              <div className="px-3 py-2 space-y-1">

                {/* ── SYSTEM (server) ── */}
                <Section label="SERVER" />
                {debugStats.sysCpu >= 0 ? (
                  <>
                    <Row label="CPU" value={`${debugStats.sysCpu}%`} color={debugStats.sysCpu > 80 ? '#f87171' : '#e2e8f0'} />
                    <Bar pct={debugStats.sysCpu} color={debugStats.sysCpu > 80 ? '#f87171' : '#34d399'} />
                    <Row label="System RAM" value={`${debugStats.sysRamUsed} / ${debugStats.sysRamTotal} MB  (${debugStats.sysRamPct}%)`} color={sysRamPct > 85 ? '#f87171' : '#e2e8f0'} />
                    <Bar pct={sysRamPct} color={sysRamPct > 85 ? '#f87171' : '#818cf8'} />
                    <Row label="Process RSS" value={`${debugStats.procRss} MB`} />
                  </>
                ) : <Row label="Server" value="polling…" color="#64748b" />}

                {/* ── BROWSER memory ── */}
                <Section label="BROWSER" />
                {debugStats.heapUsed >= 0 ? (
                  <>
                    <Row label="JS Heap" value={`${debugStats.heapUsed} / ${debugStats.heapTotal} MB`} color={jsHeapPct > 80 ? '#f87171' : '#e2e8f0'} />
                    <Bar pct={jsHeapPct} color={jsHeapPct > 80 ? '#f87171' : '#818cf8'} />
                    <Row label="Heap Limit" value={`${debugStats.heapLimit} MB`} color="#64748b" />
                  </>
                ) : <Row label="JS Heap" value="N/A (Chrome only)" color="#64748b" />}

                {/* ── WEBSOCKET ── */}
                <Section label="WEBSOCKET" />
                <Row label="State" value={debugStats.wsState} color={wsColor} />
                <Row label="AudioCtx" value={debugStats.audioCtxState} />
                <Row label="PCM chunks/s" value={`${debugStats.chunksPerSec}`} />

                {/* ── VAD ── */}
                <Section label="VAD" />
                <Row label="Speech" value={debugStats.speechDetected ? 'YES ●' : 'no'} color={debugStats.speechDetected ? '#34d399' : '#94a3b8'} />
                <Row label="InTurn frames" value={`${debugStats.inTurnFrames}`} />
                <Row label="Level" value={debugStats.avgLevel.toFixed(4)} />
                <Row label="Threshold" value={debugStats.silenceThresh.toFixed(4)} />
                <Row label="Ambient" value={debugStats.ambient.toFixed(4)} />
                <Row label="VoiceRatio" value={`${debugStats.voiceRatio.toFixed(2)} ${debugStats.voiceRatio >= 0.35 ? '✓voice' : '✗noise'}`} />
                <Bar pct={levelPct} color={debugStats.speechDetected ? '#34d399' : '#fbbf24'} />
                <Row
                  label="Silence timer"
                  value={silenceSec != null ? `${silenceSec}s / ${silenceLimit}s` : `– / ${silenceLimit}s`}
                  color={silenceSec != null && parseFloat(silenceSec) > debugStats.silenceDurationMs * 0.7 / 1000 ? '#f87171' : '#94a3b8'}
                />
              </div>
            );
          })()}
        </div>
      </div>
      )}
      {/* ── END DEV DEBUG OVERLAY ── */}

      {/* ── Main interview UI ── */}
      <div className="flex h-[100dvh] overflow-hidden bg-[#0F1117]">

        {/* ════ LEFT PANEL: Video feeds (dark) — 40% ════ */}
        <div className="w-[40%] flex-shrink-0 flex flex-col bg-[#0F1117] overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>

          {/* ── Top half: BINA AI Avatar ── */}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Label */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
              <span className="text-gray-400 text-[11px] font-medium tracking-wide uppercase">Bina · AI Interviewer</span>
            </div>

            {/* TalkingHead fills this half */}
            <div className="absolute inset-0 overflow-hidden">
              <TalkingHeadAvatar
                ref={talkingHeadRef}
                avatarUrl="/models/rpm-recruiter.glb"
                onReady={() => setAvatarReady(true)}
                onFallback={() => setAvatarFailed(true)}
                className="w-full h-full rounded-none"
                // Low-tier devices: skip the 3D avatar entirely (no GLB/Three.js/
                // render loop) — voice still plays via TalkingHead's Web Audio
                // fallback, and the static Bina image shows. Silent switch.
                audioOnly={effectiveDeviceCapability?.use3DAvatar === false}
              />
            </div>

            {/* Fix #2: static avatar fallback. Shown when the 3D avatar fails or
                is too slow to load. Audio still plays (Web Audio fallback) and
                the interview runs at full speed; only the visual is downgraded
                to a static Bina image with a speaking/listening indicator so
                the candidate sees a proper face instead of a blank canvas. */}
            {avatarFailed && (
              <div className="absolute inset-0 overflow-hidden flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
                <div className="relative flex flex-col items-center">
                  <div
                    className={`relative w-44 h-44 rounded-full overflow-hidden border-4 transition-colors duration-300 ${
                      isAiSpeaking ? 'border-purple-400/70' : 'border-white/20'
                    }`}
                    style={isAiSpeaking ? { boxShadow: '0 0 40px 6px rgba(147,51,234,0.35)' } : undefined}
                  >
                    <Image
                      src={lindaAvatarSrc}
                      alt="Bina - AI Interviewer"
                      fill
                      sizes="176px"
                      className="object-cover"
                      onError={() => {
                        setLindaAvatarSrc((current) => (
                          current === "/linda-avatar.webp" ? "/linda-3.png" : current
                        ));
                      }}
                    />
                  </div>
                  <div className="mt-4 text-white/90 text-lg font-semibold">Bina</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                    {isAiSpeaking ? (
                      <>
                        <span className="flex gap-0.5 items-end h-3">
                          <span className="w-1 bg-purple-400 animate-pulse" style={{ height: '40%' }} />
                          <span className="w-1 bg-purple-400 animate-pulse" style={{ height: '90%', animationDelay: '0.15s' }} />
                          <span className="w-1 bg-purple-400 animate-pulse" style={{ height: '60%', animationDelay: '0.3s' }} />
                        </span>
                        <span>Speaking…</span>
                      </>
                    ) : (
                      <span>{isRecording ? 'Listening…' : 'AI Interviewer'}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Speaking glow */}
            {isAiSpeaking && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(147,51,234,0.10) 0%, transparent 70%)' }}
              />
            )}

            {/* Bridge-phrase caption — pre-cached transition clip Bina speaks
                when the 2-min hard-cap fires. Distinct "Bina · Transition"
                chip so it's never mistaken for an interview question. Sits
                above the status pill at the bottom of the avatar pane. */}
            {bridgeCaption && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 max-w-[80%] px-4 py-2 rounded-xl bg-purple-950/60 backdrop-blur-md border border-purple-400/40 shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/40 text-[10px] font-semibold uppercase tracking-wider text-purple-100">
                    Bina · Transition
                  </span>
                </div>
                <p className="text-xs italic text-purple-50 leading-snug">
                  {bridgeCaption}
                </p>
              </div>
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
            {/* Label row — just the "You" label. The REC badge now lives INSIDE
                the webcam frame (top-right corner) so it reads as an overlay on
                the candidate's own video, not floating in the dark strip above. */}
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
                onTracksReplaced={handleTracksReplaced}
                showHandIndicator={false}
                isHandRaised={handDetection.isHandRaised}
              />

              {/* REC badge — overlaid inside the camera frame (top-right). REC is
                  persistent while the interview is live; solid red + pulse while
                  the mic is actively capturing, dimmed between turns. */}
              {isConnected && !isClosing && (
                <div className={`absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full border backdrop-blur-sm transition-colors duration-300 ${
                  isRecording && !isMuted
                    ? 'bg-red-500/60 border-red-300/80'
                    : 'bg-black/45 border-red-400/50'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full bg-red-300 ${isRecording && !isMuted ? 'animate-pulse' : 'opacity-70'}`} />
                  <span className="text-red-50 text-[10px] font-bold tracking-wide">REC</span>
                </div>
              )}

              {/* Face detection ellipse */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-16 h-24 border border-dashed border-purple-500/25 rounded-[50%] animate-pulse pointer-events-none" />

              {/* Candidate mic health — confirms which input browser selected and whether level is usable. */}
              <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
                <div className="rounded-lg border border-black/20 bg-black/55 backdrop-blur-md px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {isMuted ? (
                        <MicOff className="w-3.5 h-3.5 text-red-300 shrink-0" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      )}
                      <span className="text-white/80 text-[11px] truncate">
                        {activeMicLabel || "Microphone"}
                      </span>
                    </div>
                    <div className="w-20 h-1.5 rounded-full bg-white/15 overflow-hidden shrink-0">
                      <div
                        className={`h-full rounded-full transition-all duration-150 ${
                          micInputLow && isRecording && !isMuted ? 'bg-amber-300' : 'bg-emerald-300'
                        }`}
                        style={{ width: `${Math.max(4, Math.round(micInputLevel * 100))}%` }}
                      />
                    </div>
                  </div>
                  {isRecording && !isMuted && micInputLow && (
                    <div className="mt-1 text-[10px] leading-tight text-amber-200">
                      Microphone input is low. Check headset mic or system input.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>


        </div>

        {/* ════ RIGHT PANEL: Chat (fills remaining width) ════ */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Header — single light sky-blue color (was a purple→pink gradient).
              Foreground darkened to sky/slate so text stays readable on the
              lighter background. */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-3"
            style={{ background: '#7dd3fc' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-sky-700" />
              </div>
              <div>
                <h2 className="text-sky-900 font-bold leading-tight" style={{ fontSize: 15 }}>Chat with BINA</h2>
                <p className="text-sky-800/70 text-[11px] leading-tight">Live AI-powered interview</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* LIVE badge — FIRST in the header, green. */}
              <div className="flex items-center gap-1 px-2 py-1 bg-white/55 rounded-full border border-white/70">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-700 text-[10px] font-bold">LIVE</span>
              </div>
              {/* Identity verified */}
              {(faceVerification || voiceVerification) && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-white/55 border border-white/70">
                  <ShieldCheck className="w-3 h-3 text-sky-700" />
                  <span className="text-sky-800 text-[10px] font-semibold">ID VERIFIED</span>
                </div>
              )}
              {/* Q counter — animates on each change */}
              {questionNumber !== null && totalQuestions !== null && (
                <div
                  key={questionNumber}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/55 border border-white/70"
                  style={{ animation: 'qNumPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
                >
                  <span className="text-sky-900 text-xs font-bold tabular-nums">Q {questionNumber}</span>
                  <span className="text-sky-700/50 text-xs">/</span>
                  <span className="text-sky-700 text-xs font-semibold tabular-nums">{totalQuestions}</span>
                </div>
              )}
              {/* Clarification badge removed per design — no banner indicator
                  when Bina is re-asking the same question. */}
              <style>{`@keyframes qNumPop{0%{opacity:0;transform:scale(0.7) translateY(-4px)}60%{transform:scale(1.12) translateY(0)}100%{opacity:1;transform:scale(1) translateY(0)}}`}</style>
              {/* Per-question timer removed from header — shown as banner above chat */}
              {/* Global timer removed from the top header per UX request — the
                  interview time still runs in the backend; it's just not shown here. */}
              {/* REC badge moved to the candidate video's top-right corner; LIVE
                  moved to the front of the header (green) — see above / below. */}
              {/* Closing indicator */}
              {isClosing && (
                <div className="px-2 py-1 bg-orange-100 border border-orange-300 text-orange-700 rounded-lg text-[10px] font-medium animate-pulse">Ending...</div>
              )}
              {/* End Interview button — hidden once closing has started so it
                  can't be clicked again (the "Ending..." badge shows instead). */}
              {!isClosing && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  disabled={!isConnected}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/60 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed text-sky-900 rounded-lg border border-white/70 transition-all duration-200 font-semibold text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">End</span>
                </button>
              )}
            </div>
          </div>


          {/* ── Per-question timer banner — shown above chat when timer is active ── */}
          {questionTimerSeconds !== null && (
            <div className={`flex-shrink-0 px-4 py-2.5 border-b transition-colors duration-500 ${
              questionTimerExpired       ? 'bg-red-50 border-red-200' :
              questionTimerSeconds <= 30 ? 'bg-red-50 border-red-200' :
              questionTimerSeconds <= 60 ? 'bg-amber-50 border-amber-200' :
                                           'bg-violet-50 border-violet-200'
            }`}>
              <div className="flex items-center gap-3">
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
                    {(questionTimerExpired || questionTimerSeconds <= 0) ? "Time's up!" : isAiSpeaking ? 'Question time:' : isProcessing ? 'Answered:' : 'Answer time:'}
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
                    {(questionTimerExpired || questionTimerSeconds <= 0) ? '00:00' : formatTime(questionTimerSeconds)}
                  </span>
                </div>
              </div>
              {/* Fix 2: subtitle explaining the reduced window. Only shown
                  when Bina's speech ate a meaningful chunk of the 2-min slot
                  (≥5s), to avoid noise on clean cases where her question was
                  short and the candidate effectively has the full window.
                  Rendered as its own row BELOW the icon+timer row so it
                  doesn't overlap (was previously inside the flex-row). */}
              {lindaSpokeSeconds !== null && fullSlotSeconds !== null && lindaSpokeSeconds >= 5 && (
                <div className="pl-7 mt-1 text-[10px] text-gray-500 leading-snug">
                  Bina used {lindaSpokeSeconds}s of the {fullSlotSeconds}s question slot — you have {questionTimerTotalRef.current}s to answer.
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

          {/* AII16 — the separate "Interview Tips" card was REMOVED per UX
              review: it duplicated, word for word, the tips Bina is already
              speaking and streaming into her opening bubble, so the candidate
              read the same list twice on one screen. The tips remain both
              SPOKEN and DISPLAYED — they are part of the role_intro text in the
              chat bubble below. */}

          {/* Chat messages — wrapped in a relative container so a bottom
              gradient mask can fade any content into the chat background before
              it reaches the floating turn banner. This keeps the area behind /
              around the banner clean (no half-visible next bubble peeking
              through), and the dynamic bottom padding still reserves clearance
              so the last real message sits fully above the banner. */}
          <div className="relative flex-1 flex flex-col min-h-0">
          <div
            ref={chatScrollRef}
            className={`flex-1 overflow-y-auto px-4 pt-4 space-y-3 bg-gray-50 ${
              // Reserve bottom clearance EXACTLY when the turn banner is on
              // screen (bannerVisible = turnBanner !== null). Tying the padding
              // to the same value that renders the banner guarantees they never
              // desync — including the "Ending…" closing state, where the old
              // `!isClosing` guard dropped the padding and let the goodbye
              // message + loading bubble render BEHIND the banner.
              bannerVisible ? 'pb-52' : 'pb-4'
            }`}
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
          >
            {messages.length === 0 && !currentAiText && !currentTranscript && !isProcessing && !isCandidateTranscriptProcessing && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 text-sm text-center">Conversation will appear here...</p>
              </div>
            )}

            {/* Each row extracted to <MessageRowMemo> so parent renders
                (token reveal, timer ticks, WS handlers) don't reconcile
                prior bubbles. React.memo + stable msg refs skip them. */}
            {messages.map(msg => (
              <MessageRowMemo key={msg.id} msg={msg} candidatePhotoUrl={candidatePhotoUrl} />
            ))}

            {/* Candidate live/processing bubble — ONE persistent bubble across
                the whole recording → processing phase so its inner content
                MORPHS (waveform/live text → loading dots) instead of two
                separate bubbles mounting/unmounting (which flickered and jumped
                the layout at end-of-answer). The avatar + "Your Response" header
                + emerald container stay mounted; only the inner content swaps. It
                unmounts once the final transcript lands in `messages` (identical
                emerald "Your Response" styling → visually seamless handoff). */}
            {(isRecording || currentTranscript || (isCandidateTranscriptProcessing && !currentTranscript)) && (
              <div className="flex gap-2 flex-row-reverse">
                <YouAvatar photoUrl={candidatePhotoUrl} />
                <div className="max-w-[80%]">
                  <span className="text-[10px] font-semibold text-emerald-600 mb-0.5 block text-right">Your Response</span>
                  <div className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    {(isRecording || currentTranscript) ? (
                      <>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-emerald-600 text-[10px] font-medium">
                            {currentTranscript ? 'speaking…' : candidateLiveTranscriptEnabled ? 'listening…' : 'recording…'}
                          </span>
                        </div>
                        {currentTranscript ? (
                          <p className="text-sm leading-relaxed italic">{currentTranscript}</p>
                        ) : candidateLiveTranscriptEnabled ? (
                          <p className="text-xs leading-relaxed italic text-emerald-700/70">
                            {realtimeTranscriptionEnabled ? 'Start speaking...' : 'Listening for live transcript...'}
                          </p>
                        ) : (
                          // Batch STT models (gpt-4o-transcribe / gemini / sarvam /
                          // assemblyai): no Web Speech / live transcript. Show a live
                          // recording waveform of the candidate's mic while they answer
                          // — the transcript is revealed after the turn is processed.
                          <div className="flex flex-col gap-1.5">
                            <MicWaveform analyserRef={micAnalyserRef} active={isRecording} />
                            <p className="text-xs leading-relaxed italic text-emerald-700/70">
                              Recording… your transcript appears after you finish speaking.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      // Processing: candidate finished, transcript in flight.
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}

                    {/* Quick actions — INSIDE the response bubble, directly under
                        the waveform/live area (not a separate bottom bar). Shown
                        only during the candidate's turn (recording, not the
                        processing state). Repeat = Bina re-reads the current
                        question (no count change); Next = move on. */}
                    {isCandidateTurn && (isRecording || currentTranscript) && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-emerald-200/70">
                        <button
                          type="button"
                          onClick={handleRepeatQuestion}
                          disabled={repeatInFlight || !canRepeat}
                          title={!canRepeat ? 'Repeat is only available in the first few seconds of your turn' : undefined}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {repeatInFlight ? 'Repeating…' : 'Repeat Question'}
                        </button>
                        {(() => {
                          const isLastQuestion = questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions;
                          const nextDisabled = isLastQuestion || nextSkipInFlight;
                          return (
                            <button
                              type="button"
                              // Skipping a question is IRREVERSIBLE, so Next must
                              // fire ONLY on a deliberate pointer click — never via
                              // the keyboard, and it must never keep focus. Root
                              // cause (confirmed by the tester + sarath.log): during
                              // testing the tester Alt+Tabs to ChatGPT, copies the
                              // question, pastes, reads the answer, Alt+Tabs back —
                              // pressing keys (Space to scroll, Enter after paste)
                              // throughout. If the Next button holds keyboard focus,
                              // Space/Enter ACTIVATES it, and each time it re-enables
                              // after the next question it fires again — chaining
                              // Q3→Q4→Q5→Q6 (3 back-to-back skip_question(candidate),
                              // qsize 0 = nothing actually spoken).
                              onMouseDown={(e) => {
                                // Don't let the click move focus TO the button, so a
                                // later stray Space/Enter can't land on it.
                                e.preventDefault();
                              }}
                              onKeyDown={(e) => {
                                // Never activate via keyboard. Blocks the default
                                // Space/Enter → click on a focused button (and its
                                // OS auto-repeat), which is what accidental skips.
                                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                  e.preventDefault();
                                }
                              }}
                              onClick={(e) => {
                                // Reached only by a real pointer click/tap — keyboard
                                // activation is blocked in onKeyDown, and onMouseDown
                                // keeps focus off the button so stray Space/Enter
                                // while reading never lands here. Blur anyway as a
                                // final guard against the button retaining focus.
                                e.currentTarget.blur();
                                handleNextQuestion();
                              }}
                              disabled={nextDisabled}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                nextDisabled
                                  ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400'
                                  : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white'
                              }`}
                            >
                              {isLastQuestion ? 'Last Question' : nextSkipInFlight ? 'Moving on…' : 'Next'}
                              <SkipForward className="w-3.5 h-3.5" />
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Live AI text (streaming) — violet (matches AI bubble).
                Extracted into <LiveAIBubbleMemo> so the 80 ms token-reveal
                ticks only reconcile this bubble, not the full chat tree. */}
            {currentAiText && <LiveAIBubbleMemo text={currentAiText} />}

            {/* Thinking dots — violet (matches AI bubble) */}
            {isProcessing && !isCandidateTranscriptProcessing && !currentAiText && (
              <div className="flex gap-2">
                <img
                  src="/linda-avatar.webp"
                  onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }}
                  alt="Bina"
                  className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5"
                />
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
            {/* Bottom fade mask — dissolves any chat content into the chat
                background (gray-50) before it reaches the floating turn banner,
                so nothing shows sharply behind/around the banner. Non-
                interactive so it never blocks scrolling or clicks. Sits under
                the fixed banner (which is z-105) but above the scrolling text. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent via-gray-50/70 to-gray-50" />
            {/* ── Big countdown overlays (under the question, high visibility) ──
                Change 1: pre-turn "get ready" 5→1 before the mic opens.
                Change 2: mid-speech silence 7→1 (final 7s of the 15s window).
                pointer-events-none so the Repeat/Next action buttons underneath
                stay fully clickable — the candidate can press Next to skip the
                silence countdown without waiting for it to finish. */}
            {(preTurnCountdown != null || midSilenceCountdown != null) && (() => {
              const isPre = preTurnCountdown != null;
              const num = isPre ? preTurnCountdown : midSilenceCountdown;
              const isLastQ = questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions;
              const _sec = `${num} second${num === 1 ? '' : 's'}`;
              const title = isPre ? 'Get ready to answer' : 'Are you done with your response?';
              const subtitle = isPre
                ? 'You may speak now.'   // AII14 AC1 wording
                : isLastQ
                  ? `Ending the interview in ${_sec}. If you’re not done with your response, kindly speak up.`
                  : `Moving on to the next question in ${_sec}. If you’re not done with your response, kindly speak up.`;
              const accent = isPre ? 'text-emerald-300' : 'text-amber-300';
              const ring = isPre ? 'ring-emerald-400/40' : 'ring-amber-400/40';
              return (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-[104] flex flex-col items-center justify-center px-4">
                  <style>{`@keyframes cdPulse {0%{opacity:0;transform:scale(0.5)}22%{opacity:1;transform:scale(1.08)}68%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.85)}}`}</style>
                  <div className="flex flex-col items-center text-center">
                    {/* Title in a dark chip so it reads on the light chat background */}
                    <div className={`mb-3 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-sm ring-1 ring-white/10 text-sm sm:text-base font-bold ${accent} shadow-lg`}>{title}</div>
                    <div
                      key={`${isPre ? 'p' : 's'}-${num}`}
                      className={`flex items-center justify-center w-36 h-36 sm:w-48 sm:h-48 rounded-full bg-black/70 backdrop-blur-md ring-4 ${ring} shadow-2xl`}
                      style={{ animation: 'cdPulse 1s ease-in-out' }}
                    >
                      <span className={`font-black tabular-nums ${accent}`} style={{ fontSize: '5rem', lineHeight: 1 }}>{num}</span>
                    </div>
                    {!isPre && !isLastQ && (
                      <button
                        type="button"
                        onClick={() => handleNextQuestion()}
                        className="pointer-events-auto mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-gray-900 text-sm font-semibold shadow-lg ring-1 ring-black/10 hover:bg-gray-100 transition-colors"
                      >
                        Next question →
                      </button>
                    )}
                    {/* Subtitle in a dark chip — plain white text was invisible on
                        the light chat background (reported). */}
                    <div className="mt-3 max-w-sm px-3.5 py-2 rounded-xl bg-black/75 backdrop-blur-sm ring-1 ring-white/10 text-white text-xs sm:text-sm leading-snug shadow-lg">{subtitle}</div>
                  </div>
                </div>
              );
            })()}
            {/* ── AII14: "Are you done with your response?" confirmation ──────
                Raised after 15s of continuous silence. It does NOT end the turn:
                the mic stays open and recording continues underneath, so the
                candidate can simply keep talking and the popup disappears (AC3).
                Ending the turn is always an explicit choice — Submit (finalize
                this answer, AC4) or Next (AC5). */}
            {midSilenceConfirm && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[104] flex flex-col items-center justify-center px-4">
                <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-black/80 backdrop-blur-md ring-1 ring-amber-400/40 shadow-2xl px-5 py-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-base font-bold text-amber-300">Are you done with your response?</p>
                  </div>
                  <p className="text-xs sm:text-sm text-white/90 leading-snug mb-4">
                    If you are not done, please speak up to continue your response.
                    If you have completed your answer, click Submit to move to the next question.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleSubmitResponse}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow-lg hover:bg-emerald-600 transition-colors"
                    >
                      Submit
                    </button>
                    {!(questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) && (
                      <button
                        type="button"
                        onClick={() => handleNextQuestion()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium ring-1 ring-white/20 hover:bg-white/20 transition-colors"
                      >
                        Next question →
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[11px] text-white/60">Still recording — just keep speaking to continue.</p>
                </div>
              </div>
            )}
            {/* Turn banner — centred within the CHAT panel (never overlaps the
                video), sitting above the fade mask. All chat content stays above
                it via the reserved bottom padding. */}
            {turnBanner}
          </div>

          {/* Candidate action buttons (Repeat Question / Next) now live INSIDE
              the "Your Response" bubble, directly under the waveform — see the
              candidate live bubble above. The separate bottom action bar was
              removed per UX request. */}

          {/* Legacy input area removed (REC moved to header, Next-Q → action bar). */}
          {false && (
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-3">
            <div className="flex items-center justify-end gap-3">

              {/* Right: Recording indicator + Skip + Next Question */}
              <div className="flex items-center gap-2">
                {/* Recording badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-50 border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-red-500 text-[11px] font-semibold">REC</span>
                </div>

                {/* Next Question button.
                    Disabled when:
                      - questionTimerExpired (existing)
                      - Last question (existing — candidate must actually answer Q N/N)
                      - Bina is still speaking the question (answer window hasn't opened yet)
                      - No answer timer is running (questionTimerSeconds === null — nothing
                        to skip; prevents clicks during the gap between turns)
                      - A previous Next-Q click is still in flight (single-click guarantee —
                        cleared by the next question_timer_started event)
                    These guards together ensure: enabled ONLY when the 2-min timer is
                    ticking, and a candidate cannot fire multiple skip_question messages
                    by clicking rapidly. */}
                {isConnected && !isClosing && (
                  <button
                    disabled={
                      questionTimerExpired
                      || (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions)
                      || isAiSpeaking
                      || questionTimerSeconds === null
                      || nextSkipInFlight
                      || isMediaPaused
                    }
                    onClick={() => {
                      if (questionTimerExpired) return;
                      // Disable on last question — candidate must answer Q15/15, not skip it
                      if (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) return;
                      // Camera/mic disconnected (headset pulled, etc.) — the interview
                      // is paused and nothing can advance it until the device is back.
                      if (isMediaPausedRef.current) return;
                      // Re-entry guard: if another skip is still in flight (no new
                      // question_timer_started has arrived yet), ignore the click
                      // completely. This mirrors the disabled prop but covers the
                      // race where React hasn't repainted yet.
                      if (nextSkipInFlightRef.current) return;
                      // Guard: don't allow skip until the answer timer has started.
                      // If Bina hasn't finished speaking, there's no open answer
                      // window — skipping now would queue behind her TTS and look
                      // like a ghost skip.
                      if (isAiSpeakingRef.current && questionTimerSeconds === null) return;
                      // Mark in-flight immediately so rapid re-clicks are no-ops.
                      nextSkipInFlightRef.current = true;
                      setNextSkipInFlight(true);
                      // Safety-net: auto-release the in-flight guard after 15 s in
                      // case the backend never sends question_timer_started (WS
                      // hiccup, processing stall, etc.). Without this, one stuck
                      // skip would disable the button for the rest of the interview.
                      setTimeout(() => {
                        if (nextSkipInFlightRef.current) {
                          nextSkipInFlightRef.current = false;
                          setNextSkipInFlight(false);
                        }
                      }, 15000);

                      // Snapshot any browser-side live transcript BEFORE tearing the
                      // mic down, so a partial answer the candidate spoke isn't lost.
                      // It's sent with the skip as a fallback — the audio streamed to
                      // the backend is the primary source, but this covers the case
                      // where the backend ASR returns nothing. The backend records
                      // this partial answer against the current question instead of
                      // wiping it.
                      const skipBrowserTranscript = backendLiveTranscriptEnabled ? "" : snapshotVisibleLiveTranscript();

                      // Did the candidate actually speak before clicking Next? Capture
                      // it BEFORE abortRecordingForSkip resets speechDetectedRef. When
                      // true, the backend records their partial answer, so we show the
                      // "Your Response" loading bubble immediately (dots) and let the
                      // incoming transcript fill it in — instead of a blank gap that
                      // suddenly pops the transcript.
                      const hadSpeechForSkip = speechDetectedRef.current;

                      // 0. If Bina is speaking, stop her immediately
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
                      abortRecordingForSkipRef.current();

                      // 1b. If the candidate spoke, show the "Your Response" loading
                      //     bubble right away. abortRecordingForSkip cleared this flag
                      //     and currentTranscript above; re-set it here (same event
                      //     handler → React batches, this wins) so the bubble with the
                      //     bouncing dots appears at once and the backend's transcript
                      //     replaces it when it lands — no blank-then-sudden jump.
                      if (hadSpeechForSkip) {
                        setCurrentTranscript("");
                        currentTranscriptRef.current = "";
                        setIsCandidateTranscriptProcessing(true);
                      }

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

                      // 5c. Visual feedback while waiting for Bina to speak the next question
                      setStatus("Bina is preparing the next question...");

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
                        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                      }

                      // 7. Send skip — backend records any partial answer (buffered
                      //    audio + this browser-transcript fallback), then generates
                      //    the next Q. If nothing was spoken it's a plain skip.
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                          type: 'skip_question',
                          source: 'candidate',
                          browser_transcript: skipBrowserTranscript || undefined,
                        }));
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
                      questionTimerExpired || (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) || isMediaPaused
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
          )}
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
          <div className="relative w-full max-w-[95vw] sm:max-w-md bg-[#0F1929] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 p-6 flex flex-col gap-5">
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
                  // End means END: go straight to Bina's Thank-you close with NO
                  // further question. Enter closing on the client immediately
                  // (hides the End button, stops reacting to further turns), stop
                  // the mic SILENTLY — abortRecordingForSkip does NOT send end_turn,
                  // so the backend never runs the answer→next-question pipeline that
                  // used to make Bina ask a clarification after End — then tell the
                  // backend to close. The backend cancels any in-flight generation
                  // and plays ONLY the farewell.
                  setIsClosing(true);
                  isClosingRef.current = true;
                  setStatus("Ending interview…");
                  try { abortRecordingForSkipRef.current?.(); } catch { /* mic already stopped */ }
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'end_interview' }));
                  }
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
          <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-7 flex flex-col items-center gap-5">
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
                      {(questionTimerExpired || questionTimerSeconds <= 0) ? '00:00' : formatTime(questionTimerSeconds)}
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

      {/* ── Camera/mic disconnected overlay — 3-minute pause+grace ──
          Covers camera, mic (headset included), or both — wording/icon are
          computed straight from proctoringState so they always reflect
          what's CURRENTLY down, independent of what originally armed the
          pause. Auto-resumes the moment every affected device is back (no
          button to click — InterviewProctoringMonitor's health-check clears
          isCameraActive/isMicrophoneActive on its own the instant the device
          is live again). If the countdown reaches zero while still
          disconnected, the parent portal terminates the interview.
          When the MICROPHONE (headset) is down, the candidate cannot answer
          anyway, so this hard-blocks the page — a real backdrop plus
          pointer-events-auto on the wrapper — so Next/Skip and everything
          else behind it is unreachable until the headset is reconnected.
          When only the camera is down and the mic is still fine, the overlay
          stays the original non-blocking heads-up (transparent,
          pointer-events-none on the wrapper) so the candidate can keep
          answering by voice while the camera recovers. */}
      {isMediaPaused && isConnected && !isClosing && (
        <div className={`fixed inset-0 z-[200] flex items-center justify-center ${
          proctoringState.isMicrophoneActive
            ? 'pointer-events-none'
            : 'pointer-events-auto bg-black/70 backdrop-blur-sm'
        }`}>
          <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-red-500/30 rounded-2xl shadow-2xl shadow-black/60 p-7 flex flex-col items-center gap-5 pointer-events-auto">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/15 border border-red-400/30">
              {!proctoringState.isCameraActive
                ? <Camera className="w-6 h-6 text-red-400" />
                : <MicOff className="w-6 h-6 text-red-400" />}
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold text-base mb-1">
                {!proctoringState.isCameraActive && !proctoringState.isMicrophoneActive
                  ? "Camera & Microphone Disconnected"
                  : !proctoringState.isCameraActive
                  ? "Camera Disconnected"
                  : "Headset Disconnected"}
              </h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">
                {!proctoringState.isCameraActive && !proctoringState.isMicrophoneActive
                  ? "Your interview is paused. Please reconnect your camera and headset — it will resume automatically."
                  : !proctoringState.isCameraActive
                  ? "Your interview is paused. Please reconnect your camera — it will resume automatically."
                  : "Your interview is paused. Please reconnect your headset — it will resume automatically."}
              </p>
            </div>
            {mediaPauseSecondsRemaining !== null && (
              <div className="w-full rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-center">
                <span className="block text-[11px] font-semibold text-red-200 uppercase tracking-wider mb-1">
                  Interview will end in
                </span>
                <span className={`font-mono font-bold text-3xl tabular-nums ${
                  mediaPauseSecondsRemaining <= 30 ? 'text-red-300' : 'text-red-200'
                }`}>
                  {formatTime(mediaPauseSecondsRemaining)}
                </span>
                <span className="block text-[10px] text-red-300/80 mt-1">
                  Reconnect it now to continue without interruption
                </span>
              </div>
            )}
            <div className="text-xs text-[#64748B]">This event has been recorded</div>
          </div>
        </div>
      )}

      {/* ── Media-permission terminal block ──
          Shown the moment camera / mic permission is revoked or denied.
          Supersedes every other overlay (z-[300] > fullscreen overlay's z-[200]).
          The interview cannot resume from this state — the candidate must
          restore permissions AND restart the session from scratch, which
          matches the product rule "do not allow to start the interview again". */}
      {/* ── Picture-in-Picture overlay — hard-blocks the interview while a video
          is detached into a floating always-on-top window. Unlike the
          fullscreen-exit overlay, there's no grace countdown: entering PiP is
          a deliberate action, not an accidental blur, so the block is
          immediate. It auto-clears the moment leavepictureinpicture fires
          (proctoringState.isPiPActive flips back to false in the monitor
          hook) — no separate "resume" flow needed. ── */}
      {proctoringState.isPiPActive && isConnected && !isClosing && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-red-500/40 rounded-2xl shadow-2xl shadow-red-900/40 p-7 flex flex-col items-center gap-5">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 border border-red-400/40">
              <PictureInPicture2 className="w-6 h-6 text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold text-base mb-1">Picture-in-Picture Detected</h3>
              <p className="text-[#cbd5e1] text-sm leading-relaxed">
                A video was detached into a floating window. This has been logged
                as a proctoring violation.
              </p>
              <p className="text-[#94A3B8] text-sm leading-relaxed mt-2">
                Please exit Picture-in-Picture mode to continue the interview.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Screen recording detected (BUG09) — the interview is PAUSED, not ended.
          Blocks interaction because it must not proceed while recording, and
          lifts itself as soon as the parent portal's re-check sees the recording
          has stopped. Sits above the media-pause card but below the terminal
          media-block overlay. */}
      {isRecordingPaused && isConnected && !isClosing && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-red-500/40 rounded-2xl shadow-2xl shadow-red-900/30 p-7 flex flex-col items-center gap-5">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/15 border border-red-400/30">
              <Monitor className="w-7 h-7 text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold text-base mb-2">
                Screen recording detected. Please stop or turn off screen recording to continue.
              </h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">
                Your interview is paused — nothing has been lost. Stop the recording
                (in the recorder app, or with your system&apos;s stop shortcut), and the
                interview resumes automatically from the same question.
              </p>
              <p className="text-[#64748B] text-xs leading-relaxed mt-3">
                Keep sharing your screen for the interview — that must stay on. Your
                answer time is frozen while this message is showing.
              </p>
            </div>
            <div className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/5 px-4 py-2.5">
              <Loader2 className="w-3.5 h-3.5 text-red-300 animate-spin" />
              <span className="text-[11px] text-red-200">Checking every few seconds…</span>
            </div>
            <div className="text-xs text-[#64748B]">This event has been recorded</div>
          </div>
        </div>
      )}

      {mediaBlocked && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-red-500/40 rounded-2xl shadow-2xl shadow-red-900/40 p-7 flex flex-col items-center gap-5">
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

      <EnvironmentVerificationOverlay
        active={Boolean(envVerification)}
        qrCodeDataUri={envVerification?.qrCodeDataUri ?? null}
        verificationUrl={envVerification?.verificationUrl ?? null}
        expiresAt={envVerification?.expiresAt ?? null}
        challengeColor={envVerification?.challengeColor ?? null}
        challengeId={envVerification?.challengeId ?? null}
        challengeRevealed={envVerification?.challengeRevealed ?? false}
        challengeColors={envVerification?.challengeColors ?? null}
        recordingStartedAt={envVerification?.recordingStartedAt ?? null}
        onExpired={() => {
          // Candidate never completed verification in time — never hard-stall
          // the interview on it. Resume ourselves; the backend independently
          // records an environment_verification_timed_out event. Routed
          // through the same guard as the WS "submitted" case and the status-
          // poll fallback so a near-simultaneous submission/expiry can't
          // double-send session_resume.
          resumeEnvVerification();
        }}
      />

      {/* Tester mute dot removed per UX request. */}
    </>
  );
}
