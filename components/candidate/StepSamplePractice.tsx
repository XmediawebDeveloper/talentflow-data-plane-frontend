'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Mic,
  MicOff,
  MessageSquare,
  Volume2,
  Loader2,
  ChevronRight,
  Play,
  CheckCircle,
  Check,
  Clock,
  Headset,
  LogOut,
  Wifi,
  WifiOff,
  Maximize,
  Minimize,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { isTranscriptMeaningful } from '@/lib/utils/whisperFilter';
import { recordPcm16 } from '@/lib/utils/pcmEnroll';
// Reuse the SAME realtime waveform the live interview uses (canvas equalizer
// reading the mic AnalyserNode), so practice looks identical.
import { MicWaveform } from '@/components/ai-interview/MicWaveform';
import { canOpenDevice } from '@/lib/utils/mediaDeviceProbe';
import { revealAfterPaint, stickyOffset, candidateScrollBehavior } from '@/lib/utils/candidateScroll';

// ── Component props ──────────────────────────────────────────────────────────

interface StepSamplePracticeProps {
  token: string;
  onStartInterview: () => void;
  onGoBack?: () => void;
  selectedLanguage?: string;
  submitting?: boolean;
  /** Shown as "YOU · NAME" over the camera, as in the live interview. */
  candidateName?: string;
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
// confirm their mic + video work, and nothing here is stored in our database.
// (No recording playback any more — the Live/Replay toggle was removed.)
const PRACTICE_GREETING =
  "Hi, this is Bina. Welcome — this is just a practice session. Before the real interview begins, let's make sure everything is working correctly, especially your microphone and camera. Go ahead and answer the practice question, and check that you can be seen and heard clearly. Don't worry — this practice is only for you to test yourself and nothing is stored in our database.";

// The actual practice question, asked AFTER the greeting.
const PRACTICE_QUESTION =
  'Whenever you are ready, please briefly introduce yourself — your name, background, and what excites you about this role.';

// Practice question 2 — a Yes / No HR question, answered with the same
// A Yes / B No / C Need to Explain More card the live interview shows for
// Yes/No HR questions. (No recorded clip — spoken with the browser voice.)
const PRACTICE_HR_QUESTION =
  'Are you comfortable working in a hybrid setup, with a few days a week in the office?';
const PRACTICE_QUESTION_COUNT = 2;

// Full script the AI voice reads aloud: greeting first, then the question.
const PRACTICE_SPOKEN_SCRIPT = `${PRACTICE_GREETING} ${PRACTICE_QUESTION}`;

// Bina's REAL voice for practice. The live interview's voice is synthesized on
// the server and streamed over the interview WebSocket, which only opens for
// the real interview — so practice plays pre-recorded clips of the same voice
// saying its three fixed lines. Each clip must say EXACTLY its script:
//   full     → PRACTICE_SPOKEN_SCRIPT (greeting + question, on Start)
//   question → PRACTICE_QUESTION      (Repeat Question)
//   closing  → PRACTICE_CLOSING_MESSAGE (after Next)
// A clip that is missing or fails to load falls back to the browser voice.
type PracticeClipKey = 'full' | 'question' | 'closing';
const PRACTICE_VOICE_CLIPS: Record<PracticeClipKey, string> = {
  full: '/audio/practice/bina-greeting-question.mp3',
  question: '/audio/practice/bina-question.mp3',
  closing: '/audio/practice/bina-closing.mp3',
};

// Bina's sign-off, spoken when the candidate finishes the practice (clicks Next).
const PRACTICE_CLOSING_MESSAGE =
  "Great — that's the idea! You're all set and ready to begin the real interview. Take a breath, relax, and do your best. All the best!";

// Bina's actual spoken/chat "Are you there?" nudge — the real interview adds
// this exact line as a new assistant chat message (handleNoResponse in
// InterviewUI.tsx) when the candidate hasn't started speaking for a while, on
// top of its own floating "Are you still there?" banner. Practice already had
// the floating banner; this is the message it was missing.
const PRACTICE_STILL_THERE_MSG =
  "Are you there? Take your time — share whatever comes to mind.";

// Spoken when the candidate STILL hasn't said anything even after the nudge
// above — the real interview's actual behavior on continued silence (seen in
// a real candidate's interview transcript: an auto-skip, not a mic-check
// popup). Then practice auto-advances exactly like clicking Next.
const PRACTICE_MOVE_ON_MSG =
  "I didn't get any response from you, so let's move on to the next question.";

// Every one of Bina's practice lines, fully shown once. Used only to find
// which of these a finished script covered (see endStreamingReveal) — never
// compared against arbitrary text. Module-level (not component state) since
// it only references the module-level script constants above.
const BINA_SCRIPT_TEXTS = [PRACTICE_GREETING, PRACTICE_QUESTION, PRACTICE_HR_QUESTION, PRACTICE_CLOSING_MESSAGE, PRACTICE_STILL_THERE_MSG, PRACTICE_MOVE_ON_MSG];

// Per-question answer window in the REAL interview (timed mode) is 2 minutes.
// The practice mock mirrors it so the candidate sees the exact same countdown.
const PRACTICE_LIMIT_SECONDS = 120;

// Pre-turn "Get ready to answer" 3-2-1 before the mic opens — same as the live
// interview (InterviewUI PRE_TURN_COUNTDOWN_FROM / PRE_TURN_TICK_MS).
const PRE_TURN_COUNTDOWN_FROM = 3;
const PRE_TURN_TICK_MS = 1250;

// "Are you done with your response?" popup — same rules as the live interview
// (InterviewUI AII14 + the 3s speech windows): speech counts only after ~3s of
// voice (inter-word dips up to 0.4s allowed); the popup appears after 15s of
// silence following that speech, closes after 3s of total speech, and never
// ends the answer by itself. Practice has its own lightweight detector (RMS +
// voice-band share of the mic analyser) because it has no live VAD pipeline.
const DONE_CONFIRM_SILENCE_MS = 15000;
// Two-stage silence ladder, per the user's direct observation of the live
// interview: 20s of total silence from the start of the turn → "Are you
// there?" nudge. If there's STILL no speech after that (recording reopens,
// then another 10s of silence) → "let's move on to the next question".
const STILL_THERE_FIRST_SILENCE_MS = 20000;
const STILL_THERE_SECOND_SILENCE_MS = 10000;
const SPEECH_SUSTAIN_MS = 3000;
const SPEECH_DIP_GRACE_MS = 400;
const SPEECH_RESUME_CONFIRM_MS = 3000;
const VAD_POLL_MS = 100;
const MIN_SPEECH_RMS = 0.03;      // byte time-domain RMS; quiet room ≈ 0.005–0.01
const AMBIENT_LEARN_CAP = 0.04;   // never learn louder than this as "room noise"
const VOICE_BAND_MIN_RATIO = 0.35;
// How recently the transcript must have grown with new text to count as proof
// of speech on its own (see transcriptActivityAtRef) — covers a noisy room or
// a quiet mic that the RMS/frequency heuristic alone misreads as silence.
// Wider than the periodic Whisper-fallback poll interval (2.5s) so a normal
// gap between backend polls never reads as "no longer speaking".
const TRANSCRIPT_ACTIVITY_WINDOW_MS = 4000;

// One speaking rate for EVERY line Bina says with the browser voice. Q1 used
// 0.9 and Q2 0.95, so the two questions both sounded and streamed at visibly
// different speeds.
const BINA_TTS_RATE = 0.95;

// Chrome silently stops a SpeechSynthesisUtterance after ~15s on its network
// voices ("Google UK English Female" — our first pick) and then never fires
// onend. The greeting + Q1 script is ~30s, so Bina went quiet mid-sentence,
// the text froze, and the mic never opened — the practice looked hung. Short
// per-sentence utterances stay well under that limit.
function splitIntoSpeechChunks(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["'”’]?\s*|[^.!?]+$/g) ?? [text];
  return parts.filter((p) => p.trim().length > 0);
}

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
  { id: 'linda', title: 'Meet Bina', body: 'Bina is your AI interviewer. She speaks each question aloud — you can replay it any time.' },
  { id: 'timer', title: 'Your 2-minute timer', body: 'Each question gives you up to 2 minutes. It counts down while you answer; when it reaches 0 the interview moves on automatically.' },
  { id: 'camera', title: 'Your camera & mic', body: 'Stay centered and clearly visible. The bar shows your live mic level so you know you are being heard.' },
  { id: 'answer', title: 'Your answer appears here', body: 'As you speak, your words are transcribed and shown here — exactly like the real interview chat.' },
  { id: 'record', title: 'Just speak — no buttons', body: 'The mic opens automatically after Bina finishes the question — simply speak your introduction. This waveform shows you are being heard. Use Repeat to hear the question again. Nothing is saved.' },
  { id: 'next', title: 'Move on with Next', body: 'When you have finished, click Next. Like the real interview it moves to the next question — here, one quick Yes / No question — and then you are ready to start.' },
];

// ── Helper: pick a good SpeechSynthesis voice ────────────────────────────────

// ── Leaving the practice: make sure the browser voice is really silent ───────
// One cancel() is not always enough. Chrome's network "Google …" voices (the
// ones pickVoice prefers) fetch each sentence's audio, and a sentence whose
// audio was still in flight can start playing AFTER the cancel — Bina's practice
// voice then talks over the real interview. pause() first, then cancel again
// for a few seconds. Only the practice uses speechSynthesis (the interview
// streams its own audio), so this can't cut the interview off; it stands down
// if a practice step has mounted again in the meantime.
let livePracticeInstances = 0;
function silenceBrowserVoiceAfterPractice(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const hush = () => {
    if (livePracticeInstances > 0) return;
    try { window.speechSynthesis.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  };
  hush();
  [250, 1000, 3000].forEach((ms) => window.setTimeout(hush, ms));
}

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
  const [panelH, setPanelH] = useState(0);
  const [panelW, setPanelW] = useState(0);
  const [cardH, setCardH] = useState(160);
  const [cardW, setCardW] = useState(420);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step) { setRing(null); return; }
    const compute = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (!target) { setRing(null); return; }
      const p = panel.getBoundingClientRect();
      setPanelH(p.height);
      setPanelW(p.width);
      if (cardRef.current) {
        setCardH(cardRef.current.offsetHeight);
        setCardW(cardRef.current.offsetWidth);
      }
      const t = target.getBoundingClientRect();
      setRing({ top: t.top - p.top - 6, left: t.left - p.left - 6, width: t.width + 12, height: t.height + 12 });
    };
    compute();
    const iv = setInterval(compute, 350); // follow layout/state changes
    window.addEventListener('resize', compute);
    return () => { clearInterval(iv); window.removeEventListener('resize', compute); };
  }, [step, stepIndex, panelRef]);

  // Bring each step's target into view (the panel is taller than a phone or a
  // short laptop screen, so later targets start below the fold). Only scrolls
  // when the target is hidden; the pinned header is cleared by the layout's
  // scroll-padding.
  const stepId = step?.id;
  useEffect(() => {
    if (!stepId) return;
    revealAfterPaint(() => panelRef.current?.querySelector(`[data-tour="${stepId}"]`), 'center');
    // Then make the TIP CARD visible too. The card is placed below/above the
    // target only after the ring is measured, so revealing just the target
    // routinely left the card (the explanation + Next) off-screen and the
    // candidate had to scroll by hand to read it. Once the target scroll has
    // settled, scroll the page so target + card both fit; when they can't
    // (a tall target such as the chat area), the card wins.
    const t = window.setTimeout(() => {
      if (document.fullscreenElement) return; // panel fills the screen; nothing to scroll
      const target = panelRef.current?.querySelector<HTMLElement>(`[data-tour="${stepId}"]`);
      const card = cardRef.current;
      if (!card) return;
      const topLimit = stickyOffset() + 12;
      const bottomLimit = window.innerHeight - 12;
      const c = card.getBoundingClientRect();
      const r = target?.getBoundingClientRect();
      let top = r ? Math.min(r.top, c.top) : c.top;
      let bottom = r ? Math.max(r.bottom, c.bottom) : c.bottom;
      if (bottom - top > bottomLimit - topLimit) {
        // Too tall for both — keep the card fully in view, with as much of
        // the target as fits next to it.
        top = c.top; bottom = c.bottom;
      }
      let delta = 0;
      if (bottom > bottomLimit) delta = bottom - bottomLimit;
      if (top - delta < topLimit) delta = top - topLimit;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: candidateScrollBehavior() });
    }, 600);
    return () => window.clearTimeout(t);
  }, [stepId, panelRef]);

  if (!step) return null;
  const isLast = stepIndex >= steps.length - 1;
  // Card sits just below the highlighted target, or just above it when there
  // isn't room below inside the panel.
  const cardTop = ring
    ? (ring.top + ring.height + 8 + cardH <= panelH - 8
        ? ring.top + ring.height + 8
        : Math.max(8, ring.top - cardH - 8))
    : undefined;
  // Horizontally the card follows the target too (centred under it, kept
  // inside the panel). Always centring it in the panel left it far from
  // targets on the right, e.g. the Your Response bubble.
  const cardLeft = ring && panelW
    ? Math.min(Math.max(8, ring.left + ring.width / 2 - cardW / 2), Math.max(8, panelW - cardW - 8))
    : undefined;

  return (
    // pointer-events-none on the wrapper: the dim + ring are visual only, so
    // Start Practice / Repeat / Next stay clickable while the tour is open.
    // Only the tooltip card takes clicks (pointer-events-auto).
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Spotlight ring — its huge box-shadow dims everything except the target.
          pointer-events-none so the candidate can still click through. */}
      {ring ? (
        <div
          className="absolute rounded-lg ring-2 ring-white/90 pointer-events-none transition-all duration-200"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height, boxShadow: '0 0 0 9999px var(--raw-rgba-2-6-20-0p72)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[var(--raw-020614)]/70 pointer-events-none" />
      )}

      {/* Tooltip card — positioned inside the panel next to the current
          target (not fixed to the viewport), so it scrolls with the page. */}
      <div
        ref={cardRef}
        className={`absolute w-[min(92%,420px)] bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-4 z-10 pointer-events-auto transition-[top,left] duration-200 ${cardTop === undefined ? 'bottom-4' : ''} ${cardLeft === undefined ? 'left-1/2 -translate-x-1/2' : ''}`}
        style={{ ...(cardTop !== undefined ? { top: cardTop } : {}), ...(cardLeft !== undefined ? { left: cardLeft } : {}) }}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">{step.title}</p>
          <span className="text-2xs font-medium text-gray-400">{stepIndex + 1} / {steps.length}</span>
        </div>
        <p className="tf-body-secondary leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button type="button" onClick={onClose} className="min-h-10 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            Skip tour
          </button>
          <button type="button" onClick={onNext} className="min-h-10 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--raw-3b82f6)] hover:bg-[var(--raw-2563eb)] transition-colors">
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
  selectedLanguage = 'English',
  submitting = false,
  faceVerification,
  candidateName,
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
  // Bina's own chat bubbles stream in ("typewriter") roughly in sync with her
  // voice, instead of appearing as one static block — see startStreamingReveal.
  // `streaming` names the exact script currently being spoken (so multiple
  // bubbles sharing one combined script, e.g. greeting + question, reveal in
  // sequence); `revealedCount` is how many of its characters are shown so far.
  const [streaming, setStreaming] = useState<{ full: string } | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [inputMode, setInputMode] = useState<'none' | 'voice' | 'typing'>('none');
  // Mic level bar — written straight to the DOM by the analyser loop (see
  // initMedia), never through React state.
  const levelBarRef = useRef<HTMLDivElement>(null);
  const audioLevelRef = useRef(0);
  // "Microphone input is low" — as under the live interview's mic card.
  const [micLow, setMicLow] = useState(false);
  // Offline → the "Reconnecting…" card (live parity).
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  // Practice question 2 (Yes / No HR question).
  const [practiceQ, setPracticeQ] = useState<1 | 2>(1);
  const practiceQRef = useRef<1 | 2>(1);
  const [hrButtonsReady, setHrButtonsReady] = useState(false);
  const [hrExplainMore, setHrExplainMore] = useState(false);
  const [hrAnswer, setHrAnswer] = useState<'Yes' | 'No' | null>(null);
  // Q1's answer, kept on screen once a voice answer to Q2 starts (starting a
  // recording clears the shared transcript).
  const [q1Answer, setQ1Answer] = useState<string | null>(null);
  // Camera overlay (live parity): the opened microphone's name.
  const [practiceMicLabel, setPracticeMicLabel] = useState('');
  const [ttsSupported, setTtsSupported] = useState(true);
  const [transcribeError, setTranscribeError] = useState('');
  // false in Brave (blocks Google Speech API) and Firefox — backend transcription used instead
  // Web Speech still captures the answer under the hood (for the final
  // transcript revealed after finishing), but — like the real Live interview
  // with batch STT — we no longer DISPLAY it growing live. Only the setter is
  // kept; the value is intentionally not read.
  const [, setHasLiveTranscript] = useState(false);
  // true when auto-speak was attempted but TTS didn't start (Brave blocks without user gesture)
  const [autoSpeakBlocked, setAutoSpeakBlocked] = useState(false);
  // Face identity warning shown when verification detects a different person
  const [faceWarning, setFaceWarning] = useState<string | null>(null);
  // Recorded video duration in seconds — null = no recording yet
  const [, setRecordedDurationSeconds] = useState<number | null>(null);
  // Live elapsed seconds shown during recording
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  // Guided coach-mark tour: -1 = inactive, 0..n-1 = current step index.
  const [tourStep, setTourStep] = useState<number>(-1);
  // True after the candidate clicks Next and Bina plays the sign-off — stops
  // the auto-record-on-question-end from re-opening the mic.
  const [practiceDone, setPracticeDone] = useState(false);
  const [doneConfirm, setDoneConfirm] = useState(false);
  // "Are you still there?" banner + whether the candidate closed it this turn.
  const [stillThere, setStillThere] = useState(false);
  // Chronological log of silence-ladder events ("Are you there?" / "let's move
  // on"), tagged with which question they happened during. Rendered at the
  // position of THAT question, not a single fixed spot — the ladder can fire
  // again during Q2 after already firing during Q1, and a fixed position
  // showed Q1's events underneath Q2's content, out of chronological order.
  const [silenceLog, setSilenceLog] = useState<Array<{ slot: 1 | 2; kind: 'stillThere' | 'moveOn' }>>([]);
  const stillThereDismissedRef = useRef(false);
  // Guards the spoken "Are you there?" nudge (speakStillThere) to once per
  // answer window — matches the real interview's noResponseRetryRef gate.
  const stillThereNudgeSpokenRef = useRef(false);
  // Tracks retries across windows for THIS question (unlike the two guards
  // above, which reset every window): 0 → next total-silence timeout speaks
  // the "Are you there?" nudge; 1+ → the candidate still hasn't said a word
  // even after that, so it escalates to the mic-check popup instead — same
  // two-stage ladder as the real interview's noResponseRetryRef/handleNoResponse.
  const stillThereRetryRef = useRef(0);
  const practiceDoneRef = useRef(false);
  // Accumulated seconds the candidate has spent ANSWERING (excludes time while
  // Bina is speaking) — drives the 2-min countdown and survives Repeat.
  const [answerElapsed, setAnswerElapsed] = useState(0);
  // True when the 2-minute budget elapsed (as opposed to the candidate clicking
  // Next) — shows a "Time's up" message before Bina's sign-off.
  const [timedUp, setTimedUp] = useState(false);
  // Gate: Bina does NOT speak on entry. The candidate must click "Start
  // Practice" first (also gives TTS a user gesture, Brave-safe).
  const [started, setStarted] = useState(false);
  // Show the "Practice complete — start the interview" popup once practice ends.
  // Dismissible so the candidate can scroll back through the practice thread.
  const [showStartPopup, setShowStartPopup] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────

  // Chat thread scroll container — auto-scrolled to the bottom as new content
  // appears (Bina speaks → Your turn → transcript → sign-off).
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Scopes the coach-mark tour spotlight to the mock panel (not the browser).
  const panelRef = useRef<HTMLDivElement>(null);
  // Auto-scroll targets: the chat card (on Start), the control bar (while
  // answering / "Are you done?"), and the footer's Start Interview button
  // (after the practice-complete popup is closed).
  const chatCardRef = useRef<HTMLDivElement>(null);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const startInterviewRef = useRef<HTMLButtonElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Ensures the voice-identity practice top-up capture runs at most once.
  const voiceTopUpDoneRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const webSpeechFinalRef = useRef('');
  // Proactively restarts Web Speech recognition every 50s (it degrades/stops
  // after ~60s of continuous use) — same policy as the live interview.
  const webSpeechRestartRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTranscriptRef = useRef('');
  // Timestamp of the last time the transcript (Web Speech or the Whisper
  // fallback) actually grew with new text. The "are you done?"/"are you still
  // there?" VAD below reads raw mic energy + frequency band, which can
  // misjudge real speech as silence in a noisy room (AC hum, fan) or on a mic
  // whose level sits under the hardcoded floor even with noiseSuppression on
  // — the candidate IS being heard (the transcript proves it) but the local
  // heuristic alone says otherwise. Treating "transcript grew recently" as
  // its own evidence of speech cross-checks the heuristic against a signal
  // that's actually tuned to recognize human speech, not raw energy.
  const transcriptActivityAtRef = useRef(0);
  const audioMimeTypeUsedRef = useRef('');
  const hasAutoSpokeRef = useRef(false);
  const startRecordingRef = useRef<() => void>(() => {});
  // Pre-turn countdown (3→1) shown after Bina finishes, before the mic opens.
  // Set once the practice step unmounts (Start Interview). Anything that would
  // speak, count down or open the mic checks it, so a callback still in flight
  // can't restart the practice behind the real interview.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;  // React StrictMode re-mounts in dev
    livePracticeInstances += 1;
    return () => {
      unmountedRef.current = true;
      livePracticeInstances -= 1;
      silenceBrowserVoiceAfterPractice();
    };
  }, []);
  const [preTurnCountdown, setPreTurnCountdown] = useState<number | null>(null);
  const preTurnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelPreTurnCountdown = useCallback(() => {
    if (preTurnTimerRef.current) {
      clearInterval(preTurnTimerRef.current);
      preTurnTimerRef.current = null;
    }
    setPreTurnCountdown(null);
  }, []);
  const runPreTurnCountdown = useCallback((onComplete: () => void) => {
    cancelPreTurnCountdown();
    if (unmountedRef.current) return;
    let n = PRE_TURN_COUNTDOWN_FROM;
    setPreTurnCountdown(n);
    preTurnTimerRef.current = setInterval(() => {
      n -= 1;
      if (n >= 1) {
        setPreTurnCountdown(n);
      } else {
        cancelPreTurnCountdown();
        onComplete();
      }
    }, PRE_TURN_TICK_MS);
  }, [cancelPreTurnCountdown]);
  useEffect(() => () => {
    if (preTurnTimerRef.current) clearInterval(preTurnTimerRef.current);
  }, []);
  // Drives the typewriter reveal above: a single rAF loop paced to an
  // estimated (or, for Bina's recorded clips, actual) speaking duration.
  const streamRafRef = useRef<number | null>(null);
  const streamStartRef = useRef(0);
  const streamDurationRef = useRef(0);
  // Furthest character the voice has actually reached (word-boundary events /
  // finished sentences) — the reveal never trails it and re-paces to it.
  const streamBoundaryRef = useRef(0);
  const wordBoundarySeenRef = useRef(false);
  const lastRevealedRef = useRef(0);
  // Bumped on every new Bina line; callbacks from an older line are ignored.
  const ttsGenRef = useRef(0);
  // Per-take: did the mic hear anything voice-like? Gates Whisper so silence
  // is never sent (Whisper invents text from silence — see whisperFilter.ts).
  const speechHeardRef = useRef(false);
  const speechHeardMsRef = useRef(0);
  const periodicTranscriptionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const periodicTranscriptionInFlightRef = useRef(false);
  const recordingStartTimeRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Webcam + mic setup on mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const initMedia = async () => {
      try {
        // Camera and microphone are opened INDEPENDENTLY and then combined.
        //
        // A single getUserMedia({video, audio}) is all-or-nothing: on a machine
        // whose camera and mic are both peripherals, an unplugged MIC made the
        // whole call throw and took the working CAMERA down with it — the
        // preview went dead over a camera that was fine. Requesting each device
        // on its own means one missing device never hides or disables the other.
        const openOne = async (constraints: MediaStreamConstraints) => {
          try { return await navigator.mediaDevices.getUserMedia(constraints); }
          catch { return null; }
        };
        const camStream = await openOne({ video: true });
        // Bina plays out of the candidate's speakers (no headset assumed),
        // so echoCancellation MUST be requested explicitly — the same
        // constraint the real interview uses (Webcam.tsx / CandidateAIInterviewPortal.tsx)
        // for exactly this reason. Without it, her own greeting/question was
        // bleeding back into the mic and landing in the candidate's "Your
        // Response" transcript as if they'd said it. autoGainControl stays
        // OFF — it distorts quiet speech levels for ASR (see pcmEnroll.ts).
        // noiseSuppression stays OFF too — practice's pause/silence detector
        // (below) is a simple fixed-threshold RMS + frequency-band check on
        // the raw signal, unlike the real interview's server-side detection;
        // noiseSuppression's processing attenuated real speech enough to read
        // as silence, so the candidate's actual answer tripped the "Are you
        // there?" → mic-popup escalation instead of ever being detected.
        const micStream = await openOne({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
        if (cancelled) {
          camStream?.getTracks().forEach((t) => t.stop());
          micStream?.getTracks().forEach((t) => t.stop());
          return;
        }
        const videoTracks = camStream?.getVideoTracks() ?? [];
        const audioTracks = micStream?.getAudioTracks() ?? [];
        if (videoTracks.length === 0 && audioTracks.length === 0) {
          console.error('[Practice] Neither camera nor microphone could be opened');
          setMicReady(false);
          return;
        }
        const stream = new MediaStream([...videoTracks, ...audioTracks]);
        mediaStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // Only claim the mic is ready when there actually IS one — this gates
        // the practice recording UI.
        setMicReady(audioTracks.length > 0);
        setPracticeMicLabel(audioTracks[0]?.label || '');
        if (audioTracks.length === 0) {
          console.warn('[Practice] Camera opened but microphone is unavailable');
          return;  // no audio track → nothing to analyse below
        }

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
        // Only the small level bar needs this. Pushing it through React state
        // re-rendered this whole ~3000-line step on every update for the
        // entire practice (CPU pinned on 4-core laptops), so the loop writes
        // the bar's width/colour to the DOM itself, ~12x/s. micLow reads the ref.
        let lastPushAt = 0;
        let lastPushed = -1;
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const level = Math.min(rms * 5, 1);
          audioLevelRef.current = level;
          const now = performance.now();
          const q = Math.round(level * 20) / 20;
          if (now - lastPushAt >= 80 && q !== lastPushed) {
            lastPushAt = now;
            lastPushed = q;
            const bar = levelBarRef.current;
            if (bar) {
              bar.style.width = `${Math.max(q * 100, 3)}%`;
              bar.classList.toggle('bg-emerald-300', q > 0.05);
              bar.classList.toggle('bg-white/30', q <= 0.05);
            }
          }
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.error('Failed to access camera/mic:', err);
      }
    };

    // Re-acquire when a device is unplugged mid-practice.
    //
    // initMedia() runs ONCE on mount, so before this an unplugged camera froze
    // the preview and an unplugged mic left a dead track behind — the level
    // meter flatlined, the practice recording captured silence, and nothing
    // ever recovered when the candidate plugged the device back in. Re-running
    // initMedia gives a fresh stream, a fresh preview and a fresh analyser.
    //
    // Skipped while actually recording: swapping the stream under a live
    // MediaRecorder is what destroys a recording (see the interview's own
    // track-swap rule), and the recording guard already refuses to start on a
    // dead mic. The recheck lands as soon as the take finishes.
    let healInFlight = false;
    const healIfDead = async () => {
      if (cancelled || healInFlight) return;
      if (mediaRecorderRef.current?.state === 'recording') return;
      const s = mediaStreamRef.current;
      const camLive = !!s?.getVideoTracks().some(t => t.readyState === 'live');
      const micLive = !!s?.getAudioTracks().some(t => t.readyState === 'live');
      if (camLive && micLive) return;

      // Only rebuild if the MISSING device can actually be opened right now.
      //
      // Without this the watcher never converged: unplugging the headset left
      // micLive false, so every tick tore the whole stream down — INCLUDING the
      // perfectly healthy camera — re-acquired, still found no mic, and did it
      // all again 1.5s later. That visible teardown/re-acquire cycle is what
      // made the camera preview blink continuously while a device was out.
      //
      // Probing the dead device first means a permanently absent one costs a
      // cheap failing getUserMedia per tick and nothing else: no teardown, no
      // blink, and the healthy device is never punished for the other's
      // absence. The rebuild happens exactly once, when the device returns.
      const canRecoverCam = camLive || await canOpenDevice({ video: true }, 'video');
      const canRecoverMic = micLive || await canOpenDevice({ audio: true }, 'audio');
      if (cancelled) return;
      if (!(canRecoverCam && canRecoverMic)) return;  // still missing — leave everything alone

      healInFlight = true;
      try {
        console.warn(`[Practice] Device recoverable (camera=${camLive} mic=${micLive}) — rebuilding stream`);
        s?.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        analyserRef.current = null;
        try { await audioContextRef.current?.close(); } catch { /* ignore */ }
        audioContextRef.current = null;
        await initMedia();
      } finally {
        healInFlight = false;
      }
    };
    const onDeviceChange = () => { void healIfDead(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    // devicechange is the real trigger (fires on replug); this slower poll only
    // covers drivers that never fire it.
    const healId = setInterval(() => { void healIfDead(); }, 3000);

    // Share healInFlight with the FIRST acquire too, so the watcher can't race
    // it and fire a second getUserMedia while the initial one is still open.
    // (This also means a mount-time failure — arriving here with the device
    // already unplugged — is retried by the watcher rather than being terminal.)
    healInFlight = true;
    void initMedia().finally(() => { healInFlight = false; });

    if (!window.speechSynthesis) {
      setTtsSupported(false);
    }

    return () => {
      cancelled = true;
      // Retire Bina's current line BEFORE speechSynthesis.cancel() below: the
      // cancel fires the utterance's onerror, and while the generation still
      // matched, speakBina took that as "sentence done" and spoke the next one
      // — then onEnd ran the countdown and reopened the mic, so the practice
      // kept talking and listening behind the real interview.
      ttsGenRef.current += 1;
      clearInterval(healId);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current = null;
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

  // Continuous face verification is NOT run during practice. It ran face-api
  // (landmarks + descriptor, CPU backend on Windows Chrome) on the main thread
  // every 10s, yet nothing here ever showed its result and its events go to
  // the interview event bus, which isn't connected until the real interview.
  // Each run froze the page for a second or more — the practice "hang",
  // worst while toggling Fullscreen/Exit. The live interview starts it itself.

  // ── TTS: Speak the practice question ──────────────────────────────────────
  // Called only on explicit user click so the browser always has a user gesture.

  // ── Bina's recorded voice clips (see PRACTICE_VOICE_CLIPS) ───────────────
  // Preloaded on mount; a clip counts as available once its metadata loads.
  // Until then — or if it 404s — the browser voice below is used instead.
  const clipAudioRef = useRef<Partial<Record<PracticeClipKey, HTMLAudioElement>>>({});
  const clipReadyRef = useRef<Partial<Record<PracticeClipKey, boolean>>>({});
  const playingClipRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    // The clips aren't in public/audio/practice yet, so preloading them only
    // produced three 404s in every candidate's console. Opt in once the files
    // ship; until then the browser voice is used (as it already was).
    if (process.env.NEXT_PUBLIC_PRACTICE_VOICE_CLIPS !== '1') return;
    const audios = clipAudioRef.current;
    (Object.keys(PRACTICE_VOICE_CLIPS) as PracticeClipKey[]).forEach((key) => {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('loadedmetadata', () => { clipReadyRef.current[key] = true; }, { once: true });
      a.addEventListener('error', () => { clipReadyRef.current[key] = false; }, { once: true });
      a.src = PRACTICE_VOICE_CLIPS[key];
      audios[key] = a;
    });
    return () => {
      Object.values(audios).forEach((a) => { if (a) { a.pause(); a.removeAttribute('src'); a.load(); } });
    };
  }, []);

  const stopBinaClip = useCallback(() => {
    const a = playingClipRef.current;
    playingClipRef.current = null;
    if (!a) return;
    a.onplaying = null; a.onended = null; a.onerror = null;
    a.pause();
    try { a.currentTime = 0; } catch { /* not seekable yet */ }
  }, []);
  useEffect(() => () => stopBinaClip(), [stopBinaClip]);

  /** Plays one of Bina's clips. Returns false (nothing started) when that clip
   *  isn't available, so the caller uses the browser voice instead. `onFail`
   *  runs if playback is refused after starting the attempt. Called in the
   *  click's own task, so the user gesture still covers play(). */
  const playBinaClip = useCallback((
    key: PracticeClipKey,
    handlers: { onStart: () => void; onEnd: () => void; onFail: () => void },
  ): boolean => {
    if (unmountedRef.current) return true;  // left the practice: nothing plays
    const a = clipAudioRef.current[key];
    if (!a || !clipReadyRef.current[key]) return false;
    stopBinaClip();
    window.speechSynthesis?.cancel();
    try { a.currentTime = 0; } catch { /* ignore */ }
    playingClipRef.current = a;
    a.onplaying = () => { a.onplaying = null; handlers.onStart(); };
    a.onended = () => { if (playingClipRef.current === a) playingClipRef.current = null; handlers.onEnd(); };
    a.onerror = () => { if (playingClipRef.current === a) playingClipRef.current = null; handlers.onEnd(); };
    a.play().catch(() => {
      if (playingClipRef.current === a) playingClipRef.current = null;
      a.onplaying = null; a.onended = null; a.onerror = null;
      handlers.onFail();
    });
    return true;
  }, [stopBinaClip]);

  // Starting guess for reading-aloud pace at utterance rate 1.0 (chars/sec
  // incl. spaces) — only ever used for the very FIRST line Bina speaks with
  // browser TTS this session. `utterance.onboundary` is meant to correct the
  // pace in real time, but it doesn't fire reliably (or at all) for many
  // system TTS voices — Linux's in particular — so instead of guessing a
  // fixed constant for every voice/machine, measuredCharsPerSecondRef below
  // self-calibrates from the actual wall-clock time each line took to speak,
  // and every line AFTER the first uses that measured, voice-accurate pace.
  const measuredCharsPerSecondRef = useRef(18);
  const estimateSpeechMs = (text: string, rate: number) => (text.length / (measuredCharsPerSecondRef.current * rate)) * 1000;
  // {text, rate, startedAt} for whichever line is currently being spoken via
  // browser TTS — set in each onstart, consumed in the matching onend to
  // compute that line's real chars/sec and fold it into the running estimate.
  const speakingNowRef = useRef<{ length: number; rate: number; startedAt: number } | null>(null);
  const noteSpeechStart = useCallback((text: string, rate: number) => {
    speakingNowRef.current = { length: text.length, rate, startedAt: performance.now() };
  }, []);
  const noteSpeechEnd = useCallback(() => {
    const s = speakingNowRef.current;
    speakingNowRef.current = null;
    if (!s) return;
    const elapsedSec = (performance.now() - s.startedAt) / 1000;
    // Too short to be a trustworthy measurement (cut off, errored immediately, etc.).
    if (elapsedSec < 0.5) return;
    const measuredAtRate1 = s.length / (elapsedSec * s.rate);
    // Average with the running value rather than overwrite — one unusually
    // short/long line (TTS engines pause oddly on punctuation) shouldn't swing
    // the estimate for every later line.
    measuredCharsPerSecondRef.current = (measuredCharsPerSecondRef.current + measuredAtRate1) / 2;
  }, []);

  const stopStreamingReveal = useCallback(() => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  }, []);

  // Starts (or restarts) the typewriter reveal for `text`, timed to finish in
  // roughly `durationMs`. Call `endStreamingReveal` when the voice actually
  // stops — that snaps every bubble back to fully-shown, so a pace mismatch
  // (TTS running faster/slower than the estimate) never leaves text stuck
  // mid-word.
  //
  // The voice's real position (streamBoundaryRef — word boundaries / finished
  // sentences) re-paces the clock and is a floor, so the text never runs
  // backwards. Before, onboundary pushed the count forward and the next frame
  // pulled it back to the estimate, so lines jittered — badly for the first
  // line (uncalibrated estimate), barely for later ones: Q1 and Q2 streamed
  // visibly differently.
  const startStreamingReveal = useCallback((text: string, durationMs: number) => {
    stopStreamingReveal();
    setStreaming({ full: text });
    setRevealedCount(0);
    lastRevealedRef.current = 0;
    streamBoundaryRef.current = 0;
    streamStartRef.current = performance.now();
    streamDurationRef.current = Math.max(300, durationMs);
    wordBoundarySeenRef.current = false;
    let pacedAt = 0;
    const tick = () => {
      const elapsed = performance.now() - streamStartRef.current;
      const boundary = streamBoundaryRef.current;
      // Re-anchor the clock to the voice's real speed each time it reports a
      // new position (faster or slower than the estimate).
      if (boundary > pacedAt && elapsed > 800) {
        pacedAt = boundary;
        streamDurationRef.current = Math.max(300, (elapsed * text.length) / boundary);
      }
      const ratio = Math.min(1, elapsed / streamDurationRef.current);
      const linear = Math.floor(text.length * ratio);
      // With word-level events the reveal may lead the voice by a few words
      // only; voices that report just sentence ends rely on the clock.
      const capped = wordBoundarySeenRef.current ? Math.min(linear, boundary + 24) : linear;
      const next = Math.min(text.length, Math.max(lastRevealedRef.current, boundary, capped));
      if (next !== lastRevealedRef.current) {
        lastRevealedRef.current = next;
        setRevealedCount(next);
      }
      if (next < text.length) streamRafRef.current = requestAnimationFrame(tick);
    };
    streamRafRef.current = requestAnimationFrame(tick);
  }, [stopStreamingReveal]);

  // Lines that have finished being spoken at least once — shown in full from
  // then on. Without this, "streaming === null" would be ambiguous between
  // "never spoken yet" and "done speaking", and a bubble would flash its full
  // text for one render (whenever it mounts before the voice has actually
  // started — the gap between a clip/utterance being requested and its
  // start/playing event actually firing) before snapping back down to
  // streaming from empty — exactly the flash-then-shrink bug this avoids.
  // Real state (not a ref) so reading it during render stays safe/reactive.
  const [completedTexts, setCompletedTexts] = useState<Record<string, boolean>>({});

  // `completedText` is the exact script that just finished (it may cover
  // several bubbles at once, e.g. greeting + question spoken together) — every
  // known line it contains is marked done so each of their bubbles switches
  // to "fully shown" rather than restarting empty next render.
  const endStreamingReveal = useCallback((completedText?: string) => {
    stopStreamingReveal();
    if (completedText) {
      setCompletedTexts((prev) => {
        const next = { ...prev, [completedText]: true };
        BINA_SCRIPT_TEXTS.forEach((t) => { if (completedText.includes(t)) next[t] = true; });
        return next;
      });
    }
    setStreaming(null);
  }, [stopStreamingReveal]);

  // Chrome loads TTS voices asynchronously. Asking early means pickVoice()
  // already has Bina's voice when Start is clicked, so Q1 isn't spoken in the
  // system default voice while Q2 gets the preferred one.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const warm = () => { window.speechSynthesis.getVoices(); };
    warm();
    window.speechSynthesis.addEventListener('voiceschanged', warm);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warm);
  }, []);

  const activeTtsTextRef = useRef<string | null>(null);

  /** Every browser-voice line Bina says goes through here, so all of them
   *  share one voice, one rate and one streaming behaviour. Speaks sentence
   *  by sentence (Chrome's ~15s cut-off), with a per-sentence watchdog so a
   *  dropped onend can never leave the practice waiting forever. `onEnd`
   *  runs exactly once — on finish, error or watchdog — unless a newer line
   *  replaced this one. Must be called in the click's own task (Brave). */
  const speakBina = useCallback((
    text: string,
    handlers: { onStart?: () => void; onEnd: () => void },
  ) => {
    if (unmountedRef.current) return;  // left the practice: say nothing, end nothing
    const gen = ++ttsGenRef.current;
    // A line cut off by this one still ends up fully shown.
    if (activeTtsTextRef.current && activeTtsTextRef.current !== text) endStreamingReveal(activeTtsTextRef.current);
    activeTtsTextRef.current = text;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    let finished = false;
    let chunkTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (finished || gen !== ttsGenRef.current) return;
      finished = true;
      if (chunkTimer) clearTimeout(chunkTimer);
      if (activeTtsTextRef.current === text) activeTtsTextRef.current = null;
      noteSpeechEnd();
      endStreamingReveal(text);
      handlers.onEnd();
    };
    if (!synth) { finish(); return; }

    stopBinaClip();
    synth.cancel();
    synth.resume();
    const chunks = splitIntoSpeechChunks(text);
    const offsets: number[] = [];
    let pos = 0;
    for (const c of chunks) {
      const at = text.indexOf(c, pos);
      offsets.push(at === -1 ? pos : at);
      pos = (at === -1 ? pos : at) + c.length;
    }
    const voice = pickVoice();
    let started = false;
    let current = -1;

    const speakChunk = (i: number) => {
      if (finished || gen !== ttsGenRef.current) return;
      if (i >= chunks.length) { finish(); return; }
      current = i;
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.rate = BINA_TTS_RATE; u.pitch = 1.0; u.volume = 1.0;
      if (voice) u.voice = voice;
      const next = () => {
        if (current !== i || gen !== ttsGenRef.current) return;
        current = -1;
        if (chunkTimer) clearTimeout(chunkTimer);
        streamBoundaryRef.current = Math.max(streamBoundaryRef.current, offsets[i] + chunks[i].length);
        speakChunk(i + 1);
      };
      u.onstart = () => {
        if (gen !== ttsGenRef.current || started) return;
        started = true;
        noteSpeechStart(text, BINA_TTS_RATE);
        startStreamingReveal(text, estimateSpeechMs(text, BINA_TTS_RATE));
        handlers.onStart?.();
      };
      u.onboundary = (e) => {
        if (gen !== ttsGenRef.current || typeof e.charIndex !== 'number') return;
        if (e.name && e.name !== 'word') return;
        wordBoundarySeenRef.current = true;
        streamBoundaryRef.current = Math.max(streamBoundaryRef.current, offsets[i] + e.charIndex + (e.charLength || 0));
      };
      u.onend = next;
      // Our own cancel() for a newer line is filtered by the gen check in next().
      u.onerror = next;
      utteranceRef.current = u;
      synth.speak(u);
      if (chunkTimer) clearTimeout(chunkTimer);
      chunkTimer = setTimeout(() => {
        if (current !== i || gen !== ttsGenRef.current) return;
        synth.cancel();
        next();
      }, estimateSpeechMs(chunks[i], BINA_TTS_RATE) * 2.5 + 3000);
    };
    speakChunk(0);
  }, [stopBinaClip, startStreamingReveal, endStreamingReveal, noteSpeechStart, noteSpeechEnd]);

  // How much of `text` to show right now:
  //  - never spoken yet → '' (hidden, until its line actually starts)
  //  - currently being spoken → the partial reveal so far (indexOf finds this
  //    bubble's own slice when several bubbles share one combined script)
  //  - finished at least once → the full text, permanently
  const revealFor = useCallback((text: string): string => {
    if (completedTexts[text]) return text;
    if (!streaming) return '';
    const idx = streaming.full.indexOf(text);
    if (idx === -1) return '';
    const local = Math.max(0, Math.min(text.length, revealedCount - idx));
    return text.slice(0, local);
  }, [streaming, revealedCount, completedTexts]);

  // Whether `text`'s bubble should be mounted at all yet. Two bubbles can
  // share one combined script (greeting, then question, spoken back-to-back);
  // without this the LATER bubble would render immediately too — empty, with
  // its own blinking cursor — before Bina has actually reached it, showing
  // two "she's speaking" bubbles at once. A bubble whose text starts later in
  // the combined script stays unmounted until the reveal catches up to it.
  const hasStartedRevealing = useCallback((text: string): boolean => {
    if (completedTexts[text]) return true;
    if (!streaming) return false;
    const idx = streaming.full.indexOf(text);
    if (idx === -1) return false;
    return revealedCount >= idx;
  }, [streaming, revealedCount, completedTexts]);

  // One silenceLog entry → one Bina chat bubble, rendered wherever the caller
  // places it (once at Q1's position, once at Q2's) so each event shows up
  // chronologically next to the question it actually happened during.
  const renderLadderBubble = (entry: { slot: 1 | 2; kind: 'stillThere' | 'moveOn' }, key: string) => {
    const text = entry.kind === 'stillThere' ? PRACTICE_STILL_THERE_MSG : PRACTICE_MOVE_ON_MSG;
    const revealed = revealFor(text);
    return (
      <div className="flex gap-2" key={key}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/linda-avatar.webp" onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }} alt="Bina" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
        <div className="max-w-[80%]">
          <span className="text-2xs font-semibold text-purple-600 mb-0.5 block">BINA</span>
          <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
            <p className="text-sm leading-relaxed">
              {revealed}
              {streaming && revealed.length < text.length && (
                <span className="tf-blink inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 bg-violet-600 align-middle" aria-hidden="true" />
              )}
            </p>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => () => stopStreamingReveal(), [stopStreamingReveal]);

  // scriptOverride lets Repeat speak ONLY the question (no greeting). The initial
  // auto-speak passes nothing → full greeting + question.
  const speakQuestion = useCallback((scriptOverride?: string) => {
    const scriptToSpeak = scriptOverride ?? PRACTICE_SPOKEN_SCRIPT;

    // Mark her as speaking THE MOMENT we commit to this line, not when the
    // clip/utterance's start event actually fires — that event lags behind
    // (audio buffering, TTS engine startup), and in that gap "Your Response"
    // would already show a premature "Getting ready…" next to a still-empty
    // Bina bubble (aiSpeaking was still false, so the !aiSpeaking gate on
    // that card let it through early).
    setAiSpeaking(true);

    // Bina's real (recorded) voice first, when this line has a clip.
    const clipKey: PracticeClipKey | null =
      scriptToSpeak === PRACTICE_SPOKEN_SCRIPT ? 'full'
      : scriptToSpeak === PRACTICE_QUESTION ? 'question'
      : null;

    // What happens when Bina finishes the question — shared by her recorded
    // voice and the browser voice.
    const onQuestionEnd = () => {
      setAiSpeaking(false);
      endStreamingReveal(scriptToSpeak);
      if (!practiceDoneRef.current) {
        // 3-2-1 "Get ready to answer" first, then open the mic (live parity).
        runPreTurnCountdown(() => { if (!practiceDoneRef.current) startRecordingRef.current?.(); });
      }
    };

    if (clipKey && playBinaClip(clipKey, {
      onStart: () => {
        cancelPreTurnCountdown();
        setAiSpeaking(true);
        const clipEl = clipAudioRef.current[clipKey];
        const clipMs = clipEl && isFinite(clipEl.duration) && clipEl.duration > 0 ? clipEl.duration * 1000 : estimateSpeechMs(scriptToSpeak, BINA_TTS_RATE);
        startStreamingReveal(scriptToSpeak, clipMs);
      },
      onEnd: onQuestionEnd,
      // Refused (autoplay policy): for the opening line the existing
      // autoSpeakBlocked fallback opens the mic; for Repeat nothing played,
      // so the candidate can press it again. Still reveal the text in full —
      // nothing will read it aloud now, so there's nothing left to stream.
      onFail: () => { setAiSpeaking(false); endStreamingReveal(scriptToSpeak); },
    })) {
      return;
    }

    if (!window.speechSynthesis) setTtsSupported(false);
    speakBina(scriptToSpeak, {
      onStart: () => { cancelPreTurnCountdown(); setAiSpeaking(true); },
      onEnd: onQuestionEnd,
    });
  }, [cancelPreTurnCountdown, runPreTurnCountdown, playBinaClip, speakBina, startStreamingReveal, endStreamingReveal]);

  // Keep ref in sync with liveTranscript state (avoids stale-closure issues in callbacks)
  useEffect(() => {
    liveTranscriptRef.current = liveTranscript;
    if (liveTranscript.trim()) transcriptActivityAtRef.current = Date.now();
  }, [liveTranscript]);

  // Bina does NOT auto-speak on entry — the candidate starts the practice via
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
    // Nothing voice-like heard yet → don't hand Whisper silence to "transcribe".
    if (!speechHeardRef.current) return;
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

  // `resume` = continuing the same answer after a mid-answer Repeat: keep the
  // text recognised so far instead of starting over.
  const startLiveTranscription = useCallback((resume = false) => {
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
    // No Whisper polling alongside Web Speech any more: the live text isn't
    // displayed while recording, yet it re-uploaded the whole growing answer
    // every 2.5s, and on a silent mic Whisper's invented text was what the
    // candidate saw as their "answer". Whisper still runs once on stop, and
    // takes over here if Web Speech errors out (onerror below).

    if (!resume) {
      webSpeechFinalRef.current = '';
      setLiveTranscript('');
    }

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
      // Restart if still recording (recognition can time out after silence).
      // Only the CURRENT recogniser — a stale one restarting alongside a newer
      // take meant two recognisers feeding the same transcript.
      if (recognitionRef.current === recognition && mediaRecorderRef.current?.state === 'recording') {
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

    // The mic never heard anything voice-like and the browser recogniser got
    // nothing either: this take is silence/room noise. Whisper turns that into
    // made-up sentences, so don't send it at all.
    if (!speechHeardRef.current && !browserTranscript) {
      setTranscribeError("We didn't hear you. Check your microphone and try speaking again.");
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

  // Stops recording WITHOUT transcribing — same split the live interview
  // makes (stopRecordingSilent vs. its normal stop). Used only when we know
  // there's nothing worth sending: the candidate hasn't said a word this
  // whole window (the "Are you there?" nudge, the mic-check escalation).
  // stopRecordingAndTranscribe would still fire a real Whisper call on that
  // silence/room-noise and briefly show "Your Response · enhancing…" right
  // next to Bina's own nudge — exactly the premature-card bug fixed earlier,
  // just via a different path.
  const stopRecordingSilent = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    setIsRecording(false);
    recordingStartTimeRef.current = null;
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    setRecordingElapsed(0);
    stopLiveTranscription();
    setLiveTranscript('');
    try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, [stopLiveTranscription]);

  // Repeat Question mid-answer: Bina reads the question out of the speakers
  // while the mic is open, and echoCancellation does not reliably cancel the
  // browser's own speech voice — so her question was recorded and transcribed
  // as the candidate's answer. Pause the take (audio + recogniser) while
  // she speaks; startRecording resumes it afterwards.
  const pauseRecordingForBina = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== 'recording') return;
    try { mr.pause(); } catch { return; }
    if (webSpeechRestartRef.current) { clearInterval(webSpeechRestartRef.current); webSpeechRestartRef.current = null; }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } }
  }, []);

  const startRecording = useCallback(() => {
    if (unmountedRef.current) return;  // never reopen the mic after Start Interview
    // Guard: don't start if already recording or TTS is still speaking
    if (mediaRecorderRef.current?.state === 'recording') return;
    // Paused for a mid-answer Repeat (pauseRecordingForBina) → carry on with
    // the SAME take instead of starting a new one.
    if (mediaRecorderRef.current?.state === 'paused') {
      try { mediaRecorderRef.current.resume(); } catch { /* ignore */ }
      startLiveTranscription(true);
      return;
    }
    if (!mediaStreamRef.current?.active) return;
    speechHeardRef.current = false;
    speechHeardMsRef.current = 0;

    // Audio-only stream for recording. The track must be LIVE, not merely
    // present: an unplugged mic leaves an 'ended' track sitting in the stream,
    // so a bare length check passes and MediaRecorder happily records silence.
    // That matters beyond the practice playback — this turn also tops up the
    // candidate's enrolled voiceprint (stage=practice, below), and averaging a
    // silent sample into it degrades voice identity verification for the whole
    // interview. `mediaStreamRef.current.active` is no help either: it stays
    // true while ANY track lives, so a dead mic beside a live camera reads
    // healthy.
    const audioTracks = mediaStreamRef.current.getAudioTracks().filter(t => t.readyState === 'live');
    if (audioTracks.length === 0) {
      console.warn('[Practice] Recording blocked — no live microphone track');
      return;
    }

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

    // No video recorder: the practice replay (and its Live/Replay toggle) was
    // removed, and encoding the camera was the biggest CPU cost of practice.

    setIsRecording(true);
    setTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setTranscribeError('');
    setLiveTranscript('');
    transcriptActivityAtRef.current = 0;
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

  // Bina's spoken sign-off after the candidate finishes the practice. Runs from
  // the Next-button click (user gesture → Brave-safe). A plain utterance so it
  // doesn't trip the auto-record-on-end path (that only lives on speakQuestion).
  const speakClosing = useCallback(() => {
    // Speaking from the moment we commit, not from the clip/utterance's start
    // event (see the matching note in speakQuestion) — keeps the "Ready"/
    // "Speaking…" badge honest during that startup gap.
    setAiSpeaking(true);
    // The "start the interview" popup appears only AFTER Bina finishes the
    // sign-off. Every "sign-off is over" path (end, failure, watchdog) funnels
    // through showOnce, which also reveals the full closing text.
    let shown = false;
    const showOnce = () => {
      setAiSpeaking(false);
      endStreamingReveal(PRACTICE_CLOSING_MESSAGE);
      if (!shown) { shown = true; setShowStartPopup(true); }
    };
    // Bina's real (recorded) voice first, when the clip is available.
    if (playBinaClip('closing', {
      onStart: () => {
        setAiSpeaking(true);
        const clipEl = clipAudioRef.current.closing;
        const clipMs = clipEl && isFinite(clipEl.duration) && clipEl.duration > 0 ? clipEl.duration * 1000 : estimateSpeechMs(PRACTICE_CLOSING_MESSAGE, BINA_TTS_RATE);
        startStreamingReveal(PRACTICE_CLOSING_MESSAGE, clipMs);
      },
      onEnd: showOnce,
      onFail: showOnce,
    })) {
      // Safety net in case `ended` never arrives.
      window.setTimeout(showOnce, 20000);
      return;
    }
    speakBina(PRACTICE_CLOSING_MESSAGE, { onStart: () => setAiSpeaking(true), onEnd: showOnce });
  }, [playBinaClip, speakBina, startStreamingReveal, endStreamingReveal]);

  // Bina asks practice question 2 (Yes / No). Unlike speakQuestion it does NOT
  // open the mic afterwards — the candidate answers with the A / B / C card,
  // and only "Need to Explain More" opens the mic (as in the live interview).
  const speakHrQuestion = useCallback(() => {
    // Speaking from the moment we commit, not from the utterance's start
    // event (see the matching note in speakQuestion).
    setAiSpeaking(true);
    setHrButtonsReady(false);
    speakBina(PRACTICE_HR_QUESTION, {
      onStart: () => { cancelPreTurnCountdown(); setAiSpeaking(true); },
      onEnd: () => {
        setAiSpeaking(false);
        setTimedUp(false);
        setHrButtonsReady(true);
      },
    });
  }, [speakBina, cancelPreTurnCountdown]);

  // Bina's "Are you there?" nudge — the live interview's handleNoResponse adds
  // this exact line as a real chat message (not just a toast) when the
  // candidate hasn't started speaking at all. Live STOPS recording, speaks it,
  // then reopens the mic ~400ms later (handleNoResponse / :8688-8712) — practice
  // mirrors that exactly (via the same pre-turn countdown it already uses
  // everywhere else it reopens the mic), which also naturally re-arms a fresh
  // silence window for the second-timeout escalation below.
  const speakStillThere = useCallback(() => {
    if (stillThereNudgeSpokenRef.current) return;
    stillThereNudgeSpokenRef.current = true;
    cancelPreTurnCountdown();
    stopRecordingSilent();
    setAiSpeaking(true);
    speakBina(PRACTICE_STILL_THERE_MSG, {
      onEnd: () => {
        setAiSpeaking(false);
        if (!practiceDoneRef.current) {
          runPreTurnCountdown(() => { if (!practiceDoneRef.current) startRecordingRef.current?.(); });
        }
      },
    });
  }, [speakBina, stopRecordingSilent, cancelPreTurnCountdown, runPreTurnCountdown]);

  // Second escalation — the candidate STILL hasn't said anything even after
  // the "Are you there?" nudge above: Bina says she'll move on and the
  // practice advances exactly like clicking Next.
  // Forward reference to handlePracticeNext (declared below) — same pattern
  // as startRecordingRef, needed because speakMoveOn is declared before it.
  const handlePracticeNextRef = useRef<() => void>(() => {});

  const speakMoveOn = useCallback(() => {
    stopRecordingSilent();
    setAiSpeaking(true);
    // speakBina calls onEnd exactly once, so this can't advance twice (a
    // second advance on Q2 used to end the practice before Q2 was answered).
    speakBina(PRACTICE_MOVE_ON_MSG, {
      onEnd: () => {
        setAiSpeaking(false);
        handlePracticeNextRef.current?.();
      },
    });
  }, [stopRecordingSilent, speakBina]);

  // Called by the silence detector when a fresh total-silence window times
  // out: first time → speak the nudge; any time after → the candidate still
  // hasn't said anything, so (matching a real candidate's interview
  // transcript) Bina gives up on this question and moves on automatically.
  const handleStillSilent = useCallback(() => {
    const slot = practiceQRef.current;
    if (stillThereRetryRef.current === 0) {
      stillThereRetryRef.current = 1;
      setStillThere(true);
      setSilenceLog((prev) => [...prev, { slot, kind: 'stillThere' }]);
      speakStillThere();
    } else {
      setStillThere(false);
      setSilenceLog((prev) => [...prev, { slot, kind: 'moveOn' }]);
      speakMoveOn();
    }
  }, [speakStillThere, speakMoveOn]);

  // Next — like the real interview's "Next Question". From question 1 it moves
  // on to the Yes / No question; from question 2 it wraps up the answer and
  // Bina plays the "you're ready — all the best" sign-off (practice done, so
  // the mic doesn't auto-reopen).
  //
  // The answer's transcript is AWAITED before Bina speaks again — like the live
  // interview, the candidate's answer lands in the chat first and only then
  // does she ask the next question. Before, Q2 started while Q1's answer was
  // still showing the "transcribing" dots.
  const advancingRef = useRef(false);
  const handlePracticeNext = useCallback(async () => {
    // One advance at a time: a second Next click, the 2-minute timer or the
    // silence ladder must not fire again while the transcript is loading.
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      cancelPreTurnCountdown();
      if (practiceQRef.current === 1) {
        if (isRecording) await stopRecordingAndTranscribe();
        practiceQRef.current = 2;
        setPracticeQ(2);
        setAnswerElapsed(0);
        stillThereRetryRef.current = 0; // fresh silence ladder for the new question
        speakHrQuestion();
        return;
      }
      practiceDoneRef.current = true;
      setPracticeDone(true);
      if (isRecording) await stopRecordingAndTranscribe();
      speakClosing();
    } finally {
      advancingRef.current = false;
    }
  }, [isRecording, stopRecordingAndTranscribe, speakClosing, speakHrQuestion, cancelPreTurnCountdown]);
  useEffect(() => { handlePracticeNextRef.current = handlePracticeNext; }, [handlePracticeNext]);

  // Question 2 answered with Yes / No → finish, as Next does.
  const answerHrChoice = useCallback((choice: 'Yes' | 'No') => {
    setHrAnswer(choice);
    setHrButtonsReady(false);
    practiceDoneRef.current = true;
    setPracticeDone(true);
    speakClosing();
  }, [speakClosing]);

  // Start the practice — Bina speaks the greeting + question NOW (in the click's
  // user-gesture context so browsers don't block TTS). onend then auto-opens the
  // mic. Nothing plays before this.
  const handleStartPractice = useCallback(() => {
    if (started) return;
    setStarted(true);
    hasAutoSpokeRef.current = true;
    speakQuestion();
    // If TTS was silently blocked (Brave), flag it so the fallback opens the mic.
    setTimeout(() => { if (!window.speechSynthesis?.speaking && !playingClipRef.current) setAutoSpeakBlocked(true); }, 2000);
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
  // while Bina speaks) — full 2:00 until the candidate starts answering.
  const secondsLeft = Math.max(0, PRACTICE_LIMIT_SECONDS - answerElapsed);
  const timerLow = secondsLeft <= 30 && answerElapsed > 0;

  // ── Mic input low (live parity) ─────────────────────────────────────────
  // While the mic is open: 8s with the level never above a near-silent floor
  // → "Microphone input is low". A dead/muted/far-away mic, not a pause.
  useEffect(() => {
    if (!isRecording) return;
    const openedAt = Date.now();
    let lastHeardAt = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      if (audioLevelRef.current >= 0.015) lastHeardAt = now;
      setMicLow(now - openedAt >= 8000 && now - lastHeardAt >= 8000);
    }, 500);
    return () => { clearInterval(iv); setMicLow(false); };
  }, [isRecording]);

  // ── Offline → "Reconnecting…" (live parity) ─────────────────────────────
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Network strength for the camera overlay (live parity) ───────────────
  // The live interview times its WebSocket keepalive; practice has no socket,
  // so it times a tiny no-cache HEAD to the app's own server every 5s
  // (average of the last 3). null = still checking; -1 = offline.
  const [practiceRttMs, setPracticeRttMs] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const samples: number[] = [];
    const probe = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled) setPracticeRttMs(-1);
        return;
      }
      const t0 = performance.now();
      try {
        await fetch(`/favicon.ico?_ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      } catch {
        if (!cancelled) setPracticeRttMs(-1);
        return;
      }
      samples.push(performance.now() - t0);
      if (samples.length > 3) samples.shift();
      if (!cancelled) setPracticeRttMs(samples.reduce((a, b) => a + b, 0) / samples.length);
    };
    void probe();
    const iv = setInterval(probe, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // ── Optional fullscreen (the real interview runs fullscreen) ────────────
  // Practice never forces it: a header button enters/leaves it.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // Only the practice panel goes fullscreen (not the whole page, as F11
  // would) — so the candidate sees just the interview screen.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void panelRef.current?.requestFullscreen?.().catch(() => {});
  }, []);
  // The "Practice complete" popup and Start Interview sit OUTSIDE the panel,
  // so they'd be hidden in panel fullscreen — leave fullscreen once practice
  // is over.
  useEffect(() => {
    if (showStartPopup && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [showStartPopup]);
  // Leaving the practice step: don't strand the candidate in fullscreen.
  useEffect(() => () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // Countdown ticks whenever the answer window is open AND Bina is NOT
  // speaking — the real interview's per-question timer starts the instant the
  // question is asked and runs through the whole answer window (including a
  // Yes/No question's button-choice phase), not just while actively recording.
  // So besides an active recording, Q2's Yes/No/Need-to-Explain-More buttons
  // being up (hrButtonsReady, not yet answered) also counts as "open". Repeat
  // (Bina re-speaks → aiSpeaking) still PAUSES it, resuming from where it left.
  useEffect(() => {
    const answerWindowOpen = isRecording || (practiceQ === 2 && hrButtonsReady && !hrAnswer && !hrExplainMore);
    if (!answerWindowOpen || aiSpeaking || practiceDone) return;
    const iv = setInterval(() => {
      setAnswerElapsed((s) => Math.min(PRACTICE_LIMIT_SECONDS, s + 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRecording, aiSpeaking, practiceDone, practiceQ, hrButtonsReady, hrAnswer, hrExplainMore]);

  // Auto-finish at the 2-minute budget — mirrors the real per-question timeout:
  // show "Time's up", stop the answer, and have Bina play the sign-off (exactly
  // what the Next button does). Guarded by practiceDone so it fires once.
  useEffect(() => {
    if (!practiceDone && answerElapsed >= PRACTICE_LIMIT_SECONDS) {
      setTimedUp(true);
      handlePracticeNext();
    }
  }, [answerElapsed, practiceDone, handlePracticeNext]);

  // "Are you done?" detector — runs only while the answer window is open and
  // Bina is silent. Re-armed from scratch each time the window (re)opens.
  useEffect(() => {
    if (!isRecording || aiSpeaking || practiceDone) {
      setDoneConfirm(false);
      setStillThere(false);
      return;
    }
    stillThereDismissedRef.current = false;   // a new answer window
    stillThereNudgeSpokenRef.current = false;
    const windowOpenedAt = Date.now();
    const analyser = analyserRef.current;
    // No analyser → can't judge silence; never block transcription on it.
    if (!analyser) { speechHeardRef.current = true; return; }
    const timeBuf = new Uint8Array(analyser.fftSize);
    const freqBuf = new Uint8Array(analyser.frequencyBinCount);
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const lowBin = Math.max(1, Math.floor(200 / binHz));
    const highBin = Math.min(freqBuf.length - 1, Math.ceil(3400 / binHz));

    let ambient = 0.008;
    let speechStarted = false;
    let streakStart: number | null = null;
    let lastActiveAt: number | null = null;
    let silenceSince = 0;
    let popup = false;
    let accum = 0;
    let lastTick = Date.now();

    const iv = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - lastTick, 250);
      lastTick = now;

      analyser.getByteTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeBuf.length);
      analyser.getByteFrequencyData(freqBuf);
      let band = 0;
      let total = 0;
      for (let i = 1; i < freqBuf.length; i++) {
        total += freqBuf[i];
        if (i >= lowBin && i <= highBin) band += freqBuf[i];
      }
      const voiceLike = total > 12 ? band / total >= VOICE_BAND_MIN_RATIO : false;
      // The transcript (Web Speech / Whisper fallback) growing within the last
      // few seconds is direct proof the candidate is being heard, independent
      // of whether the raw-energy heuristic agrees — see transcriptActivityAtRef.
      const transcriptRecentlyActive = now - transcriptActivityAtRef.current < TRANSCRIPT_ACTIVITY_WINDOW_MS;
      const active = transcriptRecentlyActive || (voiceLike && rms > Math.max(MIN_SPEECH_RMS, ambient * 2.2));

      // Gate for sending this take to Whisper: ~0.6s (cumulative) of
      // voice-like sound. Deliberately looser than `active` so a quiet
      // speaker still counts, and raw signal only — the transcript can't
      // vouch for itself here.
      if (!speechHeardRef.current && voiceLike && rms > Math.max(0.015, ambient * 2)) {
        speechHeardMsRef.current += dt;
        if (speechHeardMsRef.current >= 600) speechHeardRef.current = true;
      }

      // Same streak rule as live: dips up to SPEECH_DIP_GRACE_MS keep it alive.
      if (active) {
        if (streakStart == null || lastActiveAt == null || now - lastActiveAt > SPEECH_DIP_GRACE_MS) {
          streakStart = now;
        }
        lastActiveAt = now;
      } else if (lastActiveAt != null && now - lastActiveAt > SPEECH_DIP_GRACE_MS) {
        streakStart = null;
      }
      const sustained = active && streakStart != null && now - streakStart >= SPEECH_SUSTAIN_MS;

      if (!speechStarted) {
        // Learn the room's noise level until the candidate starts speaking.
        if (!active && rms < AMBIENT_LEARN_CAP) {
          ambient = ambient * (rms > ambient ? 0.95 : 0.9) + rms * (rms > ambient ? 0.05 : 0.1);
        }
        if (sustained) {
          speechStarted = true;
          silenceSince = now;
          setStillThere(false);
          stillThereRetryRef.current = 0; // they spoke — ladder resets for next time
        } else {
          // First time through this window (never nudged yet) waits the full
          // 20s; after the nudge has already fired once, THIS window is the
          // "still nothing?" recheck, which only waits 10s before escalating.
          const threshold = stillThereRetryRef.current === 0 ? STILL_THERE_FIRST_SILENCE_MS : STILL_THERE_SECOND_SILENCE_MS;
          if (now - windowOpenedAt >= threshold && !stillThereDismissedRef.current) {
            handleStillSilent();
          }
        }
        return;
      }

      if (popup) {
        // Close after SPEECH_RESUME_CONFIRM_MS of total speech, then restart
        // the 15s window from now.
        if (active) {
          accum += dt;
          if (accum >= SPEECH_RESUME_CONFIRM_MS) {
            popup = false;
            accum = 0;
            silenceSince = now;
            streakStart = null;
            setDoneConfirm(false);
          }
        }
        return;
      }

      if (sustained) silenceSince = now;
      if (now - silenceSince >= DONE_CONFIRM_SILENCE_MS) {
        popup = true;
        accum = 0;
        setDoneConfirm(true);
      }
    }, VAD_POLL_MS);

    return () => {
      clearInterval(iv);
      setDoneConfirm(false);
      setStillThere(false);
    };
  }, [isRecording, aiSpeaking, practiceDone, handleStillSilent]);

  // Keep the chat thread pinned to the bottom as new content appears — Bina
  // speaking, "Your turn", the transcript, and the sign-off — so the latest
  // message is always in view (matches the live interview's auto-scroll).
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [started, isRecording, isTranscribing, aiSpeaking, transcript, typedAnswer, timedUp, practiceDone, transcribeError, revealedCount, liveTranscript]);

  // Page-level auto-scrolls (each only moves the page if the target is
  // hidden — on phones/tablets the panel stacks taller than the screen, and
  // on short laptops its lower half sits below the fold):
  //  - Start Practice → the chat card, so the question and controls are in view.
  useEffect(() => {
    if (started) revealAfterPaint(() => chatCardRef.current, 'nearest');
  }, [started]);
  //  - the mic opens, or "Are you done with your response?" appears → the
  //    control bar (Next / Submit live there).
  useEffect(() => {
    if (isRecording || doneConfirm) revealAfterPaint(() => controlBarRef.current, 'nearest');
  }, [isRecording, doneConfirm]);
  //  - the practice-complete popup closes → the footer's Start
  //    Interview button, so the way forward is visible.
  const startPopupWasOpen = useRef(false);
  useEffect(() => {
    if (startPopupWasOpen.current && !showStartPopup) {
      revealAfterPaint(() => startInterviewRef.current, 'nearest');
    }
    startPopupWasOpen.current = showStartPopup;
  }, [showStartPopup]);
  // NOTE: the "start the interview" popup is NOT triggered here on practiceDone
  // (that showed it too early). It's revealed from speakClosing()'s onend so it
  // appears only after Bina finishes the sign-off. See speakClosing().

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
    <div className="space-y-4">
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
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-sm font-medium">
          <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
          Practice &amp; Final Check
        </span>
        <h2 className="text-2xl font-bold text-gray-900">Let&apos;s Test Your Setup</h2>
        <p className="tf-body-muted">Answer the practice question to verify your mic and camera — this won&apos;t be evaluated.</p>
      </div>

      {/* ── Main interview-like panel (the embedded "screen") ──
          `relative` so the coach-mark tour overlay is scoped to THIS panel
          (not the whole browser) — practice stays inside its box, not fullscreen. */}
      <div ref={panelRef} className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-[var(--raw-0a1020)] [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:w-screen [&:fullscreen]:h-screen [&:fullscreen]:flex [&:fullscreen]:flex-col">
        {/* Offline → the live interview's calm "Reconnecting…" card (practice). */}
        {isOffline && (
          <div className="absolute inset-0 z-[45] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 text-center shadow-2xl ring-1 ring-sky-100 dark:ring-slate-700">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-sky-50 dark:bg-sky-500/15 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-brand-blue dark:text-sky-300 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Reconnecting…</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">You&apos;re offline. Practice continues as soon as your connection is back.</p>
              <span className="tf-badge mt-3 inline-block text-2xs bg-slate-200 text-slate-700">Practice — not recorded</span>
            </div>
          </div>
        )}

        {/* Interview-style header — the live interview's top bar, in
            practice form: PRACTICE where live shows LIVE, "Practice · Question
            1 of 1", End shown but disabled, plus Tips (re-opens the tour).
            Sized by the panel's own width (@container) like the live header. */}
        <div data-tour="header" className="@container border-b border-white/[0.07] bg-brand-blue">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Headset className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 hidden @lg:block">
                <p className="text-white font-bold leading-tight truncate" style={{ fontSize: 16 }}>Practice with Bina</p>
                <p className="hidden @3xl:block text-white/70 text-xs leading-tight truncate">Guided warm-up · nothing is saved</p>
              </div>
            </div>
            <div className="flex items-center gap-2 @2xl:gap-3 shrink-0">
              {/* PRACTICE — where the live interview shows LIVE. */}
              <div className="tf-blink flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400 text-gray-900">
                <span className="w-2 h-2 rounded-full bg-gray-900" />
                <span className="text-xs font-bold">PRACTICE</span>
              </div>
              <div className="hidden @xl:flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full bg-white/15">
                <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
                <span className="text-white text-xs font-semibold">ID Verified</span>
              </div>
              <div className="hidden @2xl:block w-px h-7 bg-white/20" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="text-white text-xs font-semibold tabular-nums whitespace-nowrap">
                  <span className="hidden @lg:inline">Practice · </span>Question {practiceQ} of {PRACTICE_QUESTION_COUNT}
                </span>
                <div className="hidden @3xl:block w-28 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${(practiceQ / PRACTICE_QUESTION_COUNT) * 100}%` }} />
                </div>
              </div>
              <div className="hidden @2xl:block w-px h-7 bg-white/20" />
              {/* End — shown so the candidate knows where it is; disabled in practice. */}
              <button
                type="button"
                disabled
                title="Ends the real interview — not available in practice"
                className="shrink-0 flex items-center gap-1.5 px-3 @md:px-4 py-2 bg-red-600/50 text-white/80 rounded-lg font-semibold text-sm cursor-not-allowed"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden @md:inline">End</span>
              </button>
              {/* Optional — the real interview runs fullscreen. */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="hidden @md:inline-flex min-h-8 items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-2xs font-medium ring-1 ring-white/20 transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Try fullscreen — the real interview runs fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                {isFullscreen ? 'Exit' : 'Fullscreen'}
              </button>
              <button
                type="button"
                onClick={() => setTourStep(0)}
                className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-2xs font-medium ring-1 ring-white/20 transition-colors"
                title="Show the guided tour"
              >
                ? Tips
              </button>
            </div>
          </div>
        </div>

        {/* 2. Answer time bar — the live interview's per-question timer, under
            the header. Counts the 2-minute practice window. */}
        <div
          data-tour="timer"
          className={`flex items-center gap-3 px-4 py-2 border-b transition-colors duration-500 ${
            secondsLeft <= 30 && answerElapsed > 0 ? 'bg-red-50 border-red-200'
              : secondsLeft <= 60 && answerElapsed > 0 ? 'bg-amber-50 border-amber-200'
              : 'bg-violet-50 border-violet-200'
          }`}
        >
          <Clock className={`w-4 h-4 shrink-0 ${timerLow ? 'text-red-500' : secondsLeft <= 60 && answerElapsed > 0 ? 'text-amber-600' : 'text-violet-500'}`} />
          <span className={`text-xs font-semibold shrink-0 ${timerLow ? 'text-red-600' : secondsLeft <= 60 && answerElapsed > 0 ? 'text-amber-700' : 'text-violet-700'}`}>
            Practice answer time:
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-white/80 ring-1 ring-black/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${timerLow ? 'bg-red-500' : secondsLeft <= 60 && answerElapsed > 0 ? 'bg-amber-500' : 'bg-violet-500'}`}
              style={{ width: `${(secondsLeft / PRACTICE_LIMIT_SECONDS) * 100}%` }}
            />
          </div>
          <span className={`text-sm font-bold tabular-nums shrink-0 ${timerLow ? 'text-red-600 tf-blink' : secondsLeft <= 60 && answerElapsed > 0 ? 'text-amber-700' : 'text-violet-700'}`}>
            {fmtMMSS(secondsLeft)}
          </span>
        </div>

        {/* 2-Column Grid — LEFT: Bina avatar + your webcam · RIGHT: chat.
            Mirrors the real interview screen (kept inside this panel, not fullscreen). */}
        {/* In panel fullscreen the grid takes the rest of the height and the
            chat scrolls inside it ([:fullscreen_&] = inside the fullscreen
            panel). */}
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-3 gap-0 [:fullscreen_&]:flex-1 [:fullscreen_&]:min-h-0">
        {/* ── Left: Bina avatar (top) + your webcam (bottom) ── */}
        <div className="md:col-span-2 lg:col-span-1 flex flex-col bg-[var(--raw-0a1020)] [:fullscreen_&]:min-h-0 [:fullscreen_&]:overflow-y-auto">
          {/* Bina avatar */}
          {/* Inset card with rounded corners, matching the webcam frame (live parity). */}
          <div data-tour="linda" className="relative flex-1 flex flex-col items-center justify-center p-5 gap-2.5 mx-3 mt-3 rounded-xl bg-white/[0.04] overflow-hidden" style={{ minHeight: '220px' }}>
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--raw-a78bfa)] animate-pulse" />
              <span className="text-2xs font-medium tracking-wide uppercase text-[var(--raw-64748b)]">Bina · AI Interviewer</span>
            </div>
            <div
              className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 transition-colors duration-300 ${aiSpeaking ? 'border-[var(--raw-7c3aed)]/70' : 'border-white/15'}`}
              style={aiSpeaking ? { boxShadow: '0 0 34px 6px var(--raw-rgba-124-58-237-0p35)' } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/linda-avatar.webp"
                alt="Bina — AI Interviewer"
                className="w-full h-full object-cover"
                onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = '/linda-3.png'; } }}
              />
              {aiSpeaking && <span className="absolute inset-0 rounded-full ring-2 ring-[var(--raw-7c3aed)]/40 animate-ping" />}
            </div>
            <p className="text-white font-semibold text-lg leading-none">Bina</p>
            {/* Status pill — same states and colours as the live interview's
                pill under Bina: purple speaking, green your turn, amber otherwise. */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-md text-2xs font-semibold text-white transition-colors duration-300 ${
              aiSpeaking ? 'bg-purple-600/90 border-purple-400/50'
                : isRecording ? 'bg-emerald-600/90 border-emerald-400/50'
                : 'bg-amber-700/90 border-amber-400/50'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {aiSpeaking ? 'Speaking...' : isRecording ? 'Your turn' : isTranscribing ? 'Processing...' : 'Ready'}
            </span>
          </div>

          {/* Your webcam (stacked below the avatar, like the real interview) */}
          <div data-tour="camera" className="relative p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="min-w-0 truncate text-2xs font-medium tracking-wide uppercase text-[var(--raw-64748b)]" title={candidateName?.trim() || undefined}>
                You{candidateName?.trim() ? ` · ${candidateName.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}` : ''}
              </span>
            </div>
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              {/* Microphone + network cards — as on the live interview's camera. */}
              {(() => {
                const rtt = isOffline ? -1 : practiceRttMs;
                const pct = rtt === null || rtt < 0 ? null : Math.round(Math.min(100, Math.max(10, 100 - ((rtt - 100) / 900) * 90)));
                const level = rtt === -1 ? 'offline' : rtt === null ? 'checking' : rtt < 250 ? 'good' : rtt < 600 ? 'moderate' : 'poor';
                const tone = {
                  good: { icon: 'text-emerald-300', bar: 'bg-emerald-300', label: 'Good' },
                  moderate: { icon: 'text-amber-300', bar: 'bg-amber-300', label: 'Moderate' },
                  poor: { icon: 'text-red-300', bar: 'bg-red-400', label: 'Poor' },
                  checking: { icon: 'text-white/60', bar: 'bg-white/40', label: 'Checking…' },
                  offline: { icon: 'text-red-300', bar: 'bg-red-400', label: 'Offline' },
                }[level];
                return (
                  <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-none grid grid-cols-2 gap-1.5">
                    {micLow && (
                      <div className="col-span-2 rounded-md bg-amber-500/90 px-2 py-1 text-2xs font-medium leading-tight text-white">
                        Microphone input is low. Check headset mic or system input.
                      </div>
                    )}
                    <div className="min-w-0 rounded-md bg-black/70 border border-black/20 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Mic className="w-3 h-3 text-emerald-300 shrink-0" />
                        <span className="text-white/80 text-2xs truncate">{practiceMicLabel || 'Microphone'}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-white/15 overflow-hidden">
                        <div ref={levelBarRef} className="h-full rounded-full bg-white/30" style={{ width: '3%' }} />
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md bg-black/70 border border-black/20 px-2 py-1.5" title={rtt !== null && rtt >= 0 ? `Approx. ${Math.round(rtt)} ms round trip to the server` : undefined}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {level === 'offline' ? <WifiOff className={`w-3 h-3 shrink-0 ${tone.icon}`} /> : <Wifi className={`w-3 h-3 shrink-0 ${tone.icon}`} />}
                        <span className="text-white/80 text-2xs truncate">Network · <span className="font-semibold text-white">{tone.label}</span>{pct !== null ? ` ${pct}%` : ''}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-white/15 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${level === 'offline' ? 4 : pct ?? 30}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
              {(isRecording || isTranscribing) && (
                <div className={`absolute top-2 left-2 flex items-center rounded-full text-white ${isRecording ? 'tf-blink gap-1.5 text-xs font-bold px-2.5 py-1 bg-red-500 shadow-lg shadow-red-500/40 ring-2 ring-red-300/50 dark:ring-red-500/40' : 'gap-1.5 text-xs font-medium px-2.5 py-1 bg-blue-600/90'}`}>
                  {isRecording ? (<><span className="w-2 h-2 bg-white rounded-full animate-ping" />{`REC · ${recordingElapsed}s`}</>) : (<><Loader2 className="w-3 h-3 animate-spin" /> Transcribing…</>)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: chat thread + controls ── */}
        {/* Inset card with rounded corners, matching the webcam frame (live parity). */}
        <div ref={chatCardRef} className="relative md:col-span-3 lg:col-span-2 flex flex-col bg-white m-3 rounded-xl overflow-hidden [:fullscreen_&]:min-h-0" style={{ minHeight: '360px' }}>
          {/* Pre-turn "Get ready to answer" 3-2-1 — same as the live interview
              (H2 shine, no circle, PRE_TURN_TICK_MS per number). Lighter sky
              shades than live because this chat panel is dark. */}
          {preTurnCountdown != null && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center px-4">
              <style>{`@keyframes cdShine {0%{opacity:0;transform:scale(0.97);background-position:100% 0,0 0}10%{background-position:100% 0,0 0}40%{opacity:1;transform:scale(1)}92%{opacity:1;background-position:0% 0,0 0}100%{opacity:0.15;background-position:0% 0,0 0}}`}</style>
              <div className="mb-3 px-4 py-1.5 rounded-full bg-black/85 ring-1 ring-white/10 text-sm sm:text-base font-bold text-sky-300 shadow-lg">Get ready to answer</div>
              <div key={`p-${preTurnCountdown}`} className="flex items-center justify-center w-36 h-36 sm:w-48 sm:h-48">
                <span
                  className="font-extrabold tabular-nums"
                  style={{
                    fontSize: '5rem',
                    lineHeight: 1,
                    color: 'transparent',
                    background:
                      'linear-gradient(110deg, transparent 40%, var(--raw-ffffff) 50%, transparent 60%) 100% 0 / 300% 100% no-repeat, ' +
                      'linear-gradient(135deg, var(--raw-7dd3fc) 20%, var(--raw-38bdf8) 80%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 2px 12px var(--raw-rgba-56-189-248-0p35))',
                    animation: `cdShine ${PRE_TURN_TICK_MS}ms ease-in-out both`,
                  }}
                >{preTurnCountdown}</span>
              </div>
            </div>
          )}
          {/* "Are you done with your response?" — same popup as the live
              interview. It never ends the answer: keep speaking to close it, or
              Submit to finish the practice (same as the Next button). */}
          {doneConfirm && !practiceDone && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center px-4">
              <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white ring-1 ring-sky-100 dark:ring-white/10 shadow-2xl px-5 pt-5 pb-4 text-center">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-brand-blue" />
                </div>
                <p className="tf-section-title mb-2">Are you done with your response?</p>
                <p className="text-sm text-slate-600 leading-snug mb-4">
                  If you are not done, please speak up to continue your response.
                  If you have completed your answer, click Submit to {practiceQ === 1 ? 'move to the next question' : 'finish the practice'}.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handlePracticeNext}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
                  >
                    Submit
                  </button>
                </div>
                <p className="mt-3 text-2xs text-slate-500">Still recording — just keep speaking to continue.</p>
              </div>
            </div>
          )}
          {/* Start-practice gate — Bina stays silent until the candidate clicks
              Start (also gives TTS a user gesture). Sits over the chat panel.
              Held back while the guided tour is open, so the tour's spotlight
              shows the real chat, waveform and buttons instead of this cover;
              it appears as soon as the tour ends or is skipped. */}
          {!started && tourStep < 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-6">
              <div className="text-center max-w-sm">
                <div className="w-14 h-14 rounded-full bg-violet-50 ring-1 ring-violet-200 dark:ring-violet-500/30 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 text-violet-600" />
                </div>
                <h3 className="tf-section-title mb-1.5">Ready for a quick practice?</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-5">
                  When you click Start, Bina will greet you and ask you to introduce yourself. Answer just like the real interview — nothing here is saved.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleStartPractice}
                  icon={<Play className="w-4 h-4" />}
                  className="rounded-xl"
                >
                  Start Practice
                </Button>
              </div>
            </div>
          )}
          {/* Chat thread — same bubbles as the live interview: Bina (violet,
              left) and Your Response (mint, right). */}
          <div ref={chatScrollRef} data-tour="answer" className="flex-1 overflow-y-auto p-4 pb-28 space-y-3 bg-slate-50/60 dark:bg-transparent [:fullscreen_&]:!max-h-none [:fullscreen_&]:min-h-0" style={{ maxHeight: '420px' }}>
            {/* Bina greeting — only once she starts speaking; before Start it
                rendered as an empty bubble. */}
            {hasStartedRevealing(PRACTICE_GREETING) && (
            <div className="flex gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/linda-avatar.webp" onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }} alt="Bina" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
              <div className="max-w-[80%]">
                <span className="text-2xs font-semibold text-purple-600 mb-0.5 block">BINA</span>
                <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                  <p className="text-sm leading-relaxed">
                    {revealFor(PRACTICE_GREETING)}
                    {streaming && revealFor(PRACTICE_GREETING).length < PRACTICE_GREETING.length && (
                      <span className="tf-blink inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 bg-violet-600 align-middle" aria-hidden="true" />
                    )}
                  </p>
                </div>
              </div>
            </div>
            )}
            {/* Bina practice question — withheld until the greeting has
                actually finished being spoken/revealed (hasStartedRevealing),
                so it never sits there empty-with-cursor next to a greeting
                that's still mid-sentence. */}
            {hasStartedRevealing(PRACTICE_QUESTION) && (
              <div className="flex gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/linda-avatar.webp" onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }} alt="Bina" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
                <div className="max-w-[80%]">
                  <span className="text-2xs font-semibold text-purple-600 mb-0.5 block">BINA</span>
                  <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                    <p className="text-sm leading-relaxed">
                      {revealFor(PRACTICE_QUESTION)}
                      {streaming && revealFor(PRACTICE_QUESTION).length < PRACTICE_QUESTION.length && (
                        <span className="tf-blink inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 bg-violet-600 align-middle" aria-hidden="true" />
                      )}
                    </p>
                  </div>
                  {/* Play/Replay-question button removed — Repeat Question in the
                      response bubble does the same thing (replays only the question). */}
                </div>
              </div>
            )}
            {/* Your Response — like the live interview, the waveform and the
                Repeat Question / Next buttons live INSIDE this bubble. It stays
                up from the start (waiting state) so the guided tour can point
                at it. Without a mic, the typed-answer bar below is used instead. */}
            {/* Withheld while Bina is still speaking and nothing has been
                recorded yet — like the real interview, "Your Response" only
                appears once it's actually the candidate's turn, not next to
                a mid-sentence question. Once recording/an answer exists it
                stays up regardless (e.g. through a mid-answer Repeat). */}
            {!(practiceQ === 2 && hrExplainMore) && ((micReady && !aiSpeaking) || isRecording || isTranscribing || (displayAnswer && displayAnswer.trim()) || (typedAnswer && typedAnswer.trim())) && (
              <div ref={micReady ? controlBarRef : undefined} className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-2xs font-bold shadow-sm">You</div>
                <div className="max-w-[80%] min-w-0">
                  <span className="text-2xs font-semibold text-emerald-600 mb-0.5 block text-right">
                    Your Response {isTranscribing && <span className="text-sky-600">· enhancing…</span>}
                  </span>
                  <div data-tour="record" className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    {isRecording ? (
                      // Same as the live interview (and production): no live
                      // transcript while recording — just the waveform + a
                      // recording indicator. The transcript only appears once
                      // the candidate stops, exactly like InterviewUI.tsx.
                      // (liveTranscript is still captured under the hood for
                      // the final-transcript fallback in stopRecordingAndTranscribe —
                      // it's just not rendered live here any more.)
                      <>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-emerald-600 text-2xs font-medium">recording…</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <MicWaveform analyserRef={analyserRef} active={isRecording} color="var(--raw-059669)" quietColor="var(--raw-6ee7b7)" />
                          <p className="text-xs leading-relaxed italic text-emerald-700/70 dark:text-emerald-300/70">Recording… Your transcript will appear after you finish speaking.</p>
                        </div>
                      </>
                    ) : isTranscribing ? (
                      // Processing: candidate finished, transcript in flight.
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (displayAnswer || typedAnswer) ? (
                      <p className="text-sm leading-relaxed">{displayAnswer || typedAnswer}</p>
                    ) : (
                      // Waiting for the mic to open (Bina still speaking / not started).
                      <div className="flex flex-col gap-1.5">
                        <MicWaveform analyserRef={analyserRef} active={false} color="var(--raw-059669)" quietColor="var(--raw-6ee7b7)" />
                        <p className="text-xs leading-relaxed italic text-emerald-700/70 dark:text-emerald-300/70">
                          {!started ? 'Press Start to begin.' : aiSpeaking ? 'The mic opens when Bina finishes the question.' : 'Getting ready…'}
                        </p>
                      </div>
                    )}
                    {/* Repeat Question / Next — same place and style as live. */}
                    {micReady && !practiceDone && (practiceQ === 1 || hrExplainMore) && (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-emerald-200/70">
                        <button
                          type="button"
                          onClick={() => {
                            // Repeat MID-answer: just replay — the timer pauses while Bina
                            // speaks and resumes from where it left (no reset). Repeat AFTER
                            // finishing (done/timed-up): a fresh re-practice → reset the budget.
                            const wasFinished = practiceDoneRef.current;
                            practiceDoneRef.current = false;
                            setPracticeDone(false);
                            setTimedUp(false);
                            if (wasFinished) setAnswerElapsed(0);
                            setAutoSpeakBlocked(false);
                            // Repeat plays ONLY the question — not the full greeting.
                            pauseRecordingForBina();
                            speakQuestion(practiceQ === 2 ? PRACTICE_HR_QUESTION : PRACTICE_QUESTION);
                          }}
                          disabled={!started || aiSpeaking || practiceDone || isTranscribing}
                          title={practiceDone ? 'Practice complete' : 'Replay the question'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" /> Repeat Question
                        </button>
                        {/* Next — finish the answer; Bina plays the sign-off. */}
                        <button
                          data-tour="next"
                          type="button"
                          onClick={handlePracticeNext}
                          disabled={aiSpeaking || isTranscribing || practiceDone || (!isRecording && !hasAnswer)}
                          title={practiceDone ? 'Practice complete' : isRecording || hasAnswer ? 'Finish and hear Bina' : 'Answer first'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        {started && !isRecording && !hasAnswer && !aiSpeaking && !isTranscribing && (
                          <p className="basis-full text-2xs text-emerald-700/70 dark:text-emerald-300/70">Answer first — Next unlocks once you speak.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {transcribeError && !isTranscribing && <p className="text-xs text-red-600 mt-1 text-right">{transcribeError}</p>}
                </div>
              </div>
            )}
            {/* Silence-ladder events that happened during Q1 — rendered here,
                right after Q1's own response, so they stay in chronological
                order instead of appearing underneath Q2's content. */}
            {silenceLog.filter((e) => e.slot === 1).map((e, i) => renderLadderBubble(e, `silence-q1-${i}`))}
            {/* Question 1's answer, kept once a voice answer to question 2 starts. */}
            {practiceQ === 2 && hrExplainMore && (
              <div className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-2xs font-bold shadow-sm">You</div>
                <div className="max-w-[80%] min-w-0">
                  <span className="text-2xs font-semibold text-emerald-600 mb-0.5 block text-right">Your Response</span>
                  <div className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    <p className={`text-sm leading-relaxed ${q1Answer ? '' : 'italic text-emerald-700/70'}`}>{q1Answer || 'No answer recorded.'}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Practice question 2 — Yes / No, answered like the live interview's
                Yes/No HR questions: A Yes · B No · C Need to Explain More. */}
            {practiceQ === 2 && (
              <div className="flex gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/linda-avatar.webp" onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }} alt="Bina" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
                <div className="max-w-[80%]">
                  <span className="text-2xs font-semibold text-purple-600 mb-0.5 block">BINA</span>
                  <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                    <p className="text-sm leading-relaxed">
                      {revealFor(PRACTICE_HR_QUESTION)}
                      {streaming && revealFor(PRACTICE_HR_QUESTION).length < PRACTICE_HR_QUESTION.length && (
                        <span className="tf-blink inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 bg-violet-600 align-middle" aria-hidden="true" />
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {practiceQ === 2 && hrAnswer && (
              <div className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-2xs font-bold shadow-sm">You</div>
                <div className="max-w-[80%] min-w-0">
                  <span className="text-2xs font-semibold text-emerald-600 mb-0.5 block text-right">Your Response</span>
                  <div className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    <p className="text-sm font-semibold">{hrAnswer}</p>
                  </div>
                </div>
              </div>
            )}
            {practiceQ === 2 && hrButtonsReady && !hrAnswer && !hrExplainMore && !practiceDone && (
              <div className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-2xs font-bold shadow-sm">You</div>
                <div className="max-w-[260px] w-full">
                  <div className="tf-card-soft w-full p-2.5">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => answerHrChoice('Yes')}
                        disabled={isTranscribing}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-2xs font-bold shrink-0">A</span>
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => answerHrChoice('No')}
                        disabled={isTranscribing}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-2xs font-bold shrink-0">B</span>
                        No
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Voice answer: keep Q1's answer on screen (q1Answer),
                          // then open the mic exactly as for any question (3-2-1
                          // first). Must also clear transcript/typedAnswer/inputMode
                          // here, not just rely on startRecording's reset — displayAnswer
                          // reads `transcript` whenever inputMode is 'voice', and that
                          // still held Q1's answer during the 3-2-1 gap before
                          // recording actually starts, so Q2's response bubble
                          // briefly showed Q1's old answer before the waveform appeared.
                          setQ1Answer((displayAnswer || typedAnswer || '').trim() || null);
                          setTranscript('');
                          setTypedAnswer('');
                          setInputMode('none');
                          setHrExplainMore(true);
                          setHrButtonsReady(false);
                          setAnswerElapsed(0);
                          setTimedUp(false);
                          runPreTurnCountdown(() => { if (!practiceDoneRef.current) startRecordingRef.current?.(); });
                        }}
                        disabled={isTranscribing || !micReady}
                        title={!micReady ? 'Needs a microphone' : undefined}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-sm font-semibold hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-2xs font-bold shrink-0">C</span>
                        Need to Explain More
                      </button>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200 text-center tf-caption">
                      Select only one option
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Question 2 voice answer (after Need to Explain More) — the same live bubble.
                Your Response — like the live interview, the waveform and the
                Repeat Question / Next buttons live INSIDE this bubble. It stays
                up from the start (waiting state) so the guided tour can point
                at it. Without a mic, the typed-answer bar below is used instead. */}
            {practiceQ === 2 && hrExplainMore && ((micReady && !aiSpeaking) || isRecording || isTranscribing || (displayAnswer && displayAnswer.trim()) || (typedAnswer && typedAnswer.trim())) && (
              <div ref={micReady ? controlBarRef : undefined} className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-2xs font-bold shadow-sm">You</div>
                <div className="max-w-[80%] min-w-0">
                  <span className="text-2xs font-semibold text-emerald-600 mb-0.5 block text-right">
                    Your Response {isTranscribing && <span className="text-sky-600">· enhancing…</span>}
                  </span>
                  <div data-tour="record" className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    {isRecording ? (
                      // Same as the live interview (and production): no live
                      // transcript while recording — just the waveform + a
                      // recording indicator. The transcript only appears once
                      // the candidate stops, exactly like InterviewUI.tsx.
                      // (liveTranscript is still captured under the hood for
                      // the final-transcript fallback in stopRecordingAndTranscribe —
                      // it's just not rendered live here any more.)
                      <>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-emerald-600 text-2xs font-medium">recording…</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <MicWaveform analyserRef={analyserRef} active={isRecording} color="var(--raw-059669)" quietColor="var(--raw-6ee7b7)" />
                          <p className="text-xs leading-relaxed italic text-emerald-700/70 dark:text-emerald-300/70">Recording… Your transcript will appear after you finish speaking.</p>
                        </div>
                      </>
                    ) : isTranscribing ? (
                      // Processing: candidate finished, transcript in flight.
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (displayAnswer || typedAnswer) ? (
                      <p className="text-sm leading-relaxed">{displayAnswer || typedAnswer}</p>
                    ) : (
                      // Waiting for the mic to open (Bina still speaking / not started).
                      <div className="flex flex-col gap-1.5">
                        <MicWaveform analyserRef={analyserRef} active={false} color="var(--raw-059669)" quietColor="var(--raw-6ee7b7)" />
                        <p className="text-xs leading-relaxed italic text-emerald-700/70 dark:text-emerald-300/70">
                          {!started ? 'Press Start to begin.' : aiSpeaking ? 'The mic opens when Bina finishes the question.' : 'Getting ready…'}
                        </p>
                      </div>
                    )}
                    {/* Repeat Question / Next — same place and style as live. */}
                    {micReady && !practiceDone && hrExplainMore && (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-emerald-200/70">
                        <button
                          type="button"
                          onClick={() => {
                            // Repeat MID-answer: just replay — the timer pauses while Bina
                            // speaks and resumes from where it left (no reset). Repeat AFTER
                            // finishing (done/timed-up): a fresh re-practice → reset the budget.
                            const wasFinished = practiceDoneRef.current;
                            practiceDoneRef.current = false;
                            setPracticeDone(false);
                            setTimedUp(false);
                            if (wasFinished) setAnswerElapsed(0);
                            setAutoSpeakBlocked(false);
                            // Repeat plays ONLY the question — not the full greeting.
                            pauseRecordingForBina();
                            speakQuestion(practiceQ === 2 ? PRACTICE_HR_QUESTION : PRACTICE_QUESTION);
                          }}
                          disabled={!started || aiSpeaking || practiceDone || isTranscribing}
                          title={practiceDone ? 'Practice complete' : 'Replay the question'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" /> Repeat Question
                        </button>
                        {/* Next — finish the answer; Bina plays the sign-off. */}
                        <button
                          data-tour="next"
                          type="button"
                          onClick={handlePracticeNext}
                          disabled={aiSpeaking || isTranscribing || practiceDone || (!isRecording && !hasAnswer)}
                          title={practiceDone ? 'Practice complete' : isRecording || hasAnswer ? 'Finish and hear Bina' : 'Answer first'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        {started && !isRecording && !hasAnswer && !aiSpeaking && !isTranscribing && (
                          <p className="basis-full text-2xs text-emerald-700/70 dark:text-emerald-300/70">Answer first — Next unlocks once you speak.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {transcribeError && !isTranscribing && <p className="text-xs text-red-600 mt-1 text-right">{transcribeError}</p>}
                </div>
              </div>
            )}
            {/* Silence-ladder events that happened during Q2 — same
                chronological-position idea as the Q1 instance above. */}
            {silenceLog.filter((e) => e.slot === 2).map((e, i) => renderLadderBubble(e, `silence-q2-${i}`))}
            {/* Time's-up notice when the 2 minutes elapsed (not a manual Next). */}
            {timedUp && (
              <div className="flex justify-center py-1">
                <span className="tf-badge gap-1.5 text-amber-700 bg-amber-50 border border-amber-200">
                  ⏱ Time&apos;s up — that&apos;s the 2 minutes. Moving on…
                </span>
              </div>
            )}
            {/* Bina's sign-off after Next / timeout — "you're ready, all the best". */}
            {practiceDone && (
              <div className="flex gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/linda-avatar.webp" onError={(e) => { const t = e.currentTarget; if (!t.src.endsWith('/linda-3.png')) t.src = '/linda-3.png'; }} alt="Bina" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
                <div className="max-w-[80%]">
                  <span className="text-2xs font-semibold text-purple-600 mb-0.5 block">BINA</span>
                  <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                    <p className="text-sm leading-relaxed">
                      {revealFor(PRACTICE_CLOSING_MESSAGE)}
                      {streaming && revealFor(PRACTICE_CLOSING_MESSAGE).length < PRACTICE_CLOSING_MESSAGE.length && (
                        <span className="tf-blink inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 bg-violet-600 align-middle" aria-hidden="true" />
                      )}
                    </p>
                  </div>
                  <p className="mt-2 text-2xs text-emerald-600">You can now click <span className="font-semibold">Start Interview</span> below.</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom-centred turn banner (as in the live interview): red "Hold on
              — Bina is speaking" while she talks, green "Your turn" while the
              mic is open. Floats over the bottom of the chat. */}
          {(() => {
            // Same variants and order as the live interview's banner:
            // silence → time's up → Bina speaking → your turn → getting ready.
            type Variant = 'silence' | 'timesup' | 'hold' | 'turn' | 'prepare';
            let variant: Variant | null = null;
            if (stillThere && isRecording) variant = 'silence';
            else if (timedUp && (aiSpeaking || isTranscribing)) variant = 'timesup';
            else if (aiSpeaking) variant = 'hold';
            else if (started && (isRecording || (practiceQ === 2 && hrButtonsReady && !hrAnswer && !hrExplainMore && !practiceDone))) variant = 'turn';
            // Not in typed-answer mode (no mic) — there the mic never opens.
            else if (started && micReady && preTurnCountdown == null && (isTranscribing || !practiceDone)) variant = 'prepare';
            if (!variant) return null;
            const CFG: Record<Variant, { grad: string; ring: string; glow: string; title: string; subtitle: string; dismissible?: boolean }> = {
              silence: { grad: 'from-amber-700 to-amber-700', ring: 'ring-amber-300/50', glow: 'shadow-amber-700/30', title: 'Are you still there?', subtitle: 'Take your time — Bina will move on if there\u2019s no response.', dismissible: true },
              timesup: { grad: 'from-rose-500 to-red-600', ring: 'ring-rose-200/50', glow: 'shadow-red-600/30', title: "Time's up!", subtitle: practiceQ === 1 ? 'Moving to the next question…' : 'Wrapping up the practice…' },
              hold: { grad: 'from-rose-500 to-red-600', ring: 'ring-rose-200/50', glow: 'shadow-red-600/30', title: 'Hold on — Bina is speaking', subtitle: 'Please wait until she finishes the question' },
              turn: isRecording
                ? { grad: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-200/60', glow: 'shadow-emerald-500/30', title: 'Your turn — speak now', subtitle: 'Microphone is active · Bina is listening' }
                : { grad: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-200/60', glow: 'shadow-emerald-500/30', title: 'Your turn — choose an answer', subtitle: 'Pick Yes, No, or Need to Explain More' },
              prepare: { grad: 'from-rose-500 to-red-600', ring: 'ring-rose-200/50', glow: 'shadow-red-600/30', title: 'Hold on — getting ready', subtitle: 'Please wait a moment…' },
            };
            const cfg = CFG[variant];
            return (
              <div className={`absolute inset-x-0 z-20 flex justify-center px-4 pt-10 pb-3 pointer-events-none bg-gradient-to-t from-[var(--surface)] via-[color-mix(in_srgb,var(--surface)_90%,transparent)] via-60% to-transparent ${micReady ? 'bottom-0' : 'bottom-[120px]'}`}>
                <div className={`relative flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl bg-gradient-to-br ${cfg.grad} ring-1 ${cfg.ring} shadow-2xl ${cfg.glow} backdrop-blur-md min-w-0 sm:min-w-[240px] max-w-[94%]`}>
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-white/25 ring-1 ring-white/40 flex items-center justify-center">
                      {variant === 'prepare' ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : variant === 'timesup' ? (
                        <Clock className="w-4 h-4 text-white" />
                      ) : variant === 'turn' || variant === 'silence' ? (
                        <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" /><line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" /></svg>
                      ) : (
                        <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      )}
                    </div>
                    <span className="absolute inset-0 rounded-full ring-2 ring-white/50 animate-ping opacity-40" />
                  </div>
                  <div className="relative min-w-0">
                    <span className="text-white font-bold block leading-tight" style={{ fontSize: 14 }}>{cfg.title}</span>
                    <span className="text-white/85 text-2xs leading-snug block">{cfg.subtitle}</span>
                  </div>
                  {cfg.dismissible && (
                    <button
                      type="button"
                      onClick={() => { stillThereDismissedRef.current = true; setStillThere(false); }}
                      className="pointer-events-auto relative shrink-0 -mr-1 w-6 h-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 text-lg leading-none transition-colors"
                      aria-label="Dismiss"
                    >×</button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* No microphone: type the answer instead (only shown then). */}
          {!micReady && (
            <div ref={controlBarRef} className="relative border-t border-gray-100 p-3 bg-white">
              <p className="text-xs text-amber-700 mb-2"><MicOff className="w-3.5 h-3.5 inline mr-1" />No microphone — type your answer instead.</p>
              <div className="flex items-end gap-2">
                <textarea
                  value={typedAnswer}
                  onChange={e => { if (!isRecording) { setTypedAnswer(e.target.value); setInputMode('typing'); } }}
                  placeholder="Type your answer here…"
                  className="flex-1 min-h-[52px] bg-white border border-gray-200 rounded-lg p-2.5 tf-body placeholder-gray-400 resize-none focus:outline-none focus:border-brand-blue/50"
                  rows={2}
                />
                <button
                  data-tour="next"
                  type="button"
                  onClick={handlePracticeNext}
                  disabled={aiSpeaking || practiceDone || !typedAnswer.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end pt-2">
        <div className="flex flex-col w-full sm:w-auto items-stretch sm:items-end gap-1.5">
          {isRecording && (
            <p className="text-xs font-medium text-amber-500">
              Recording · {recordingElapsed}s
            </p>
          )}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Skip the optional practice and continue straight to the interview */}
            <button
              type="button"
              onClick={onStartInterview}
              disabled={submitting}
              className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Skip
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              ref={startInterviewRef}
              type="button"
              onClick={onStartInterview}
              disabled={submitting}
              className="tf-btn tf-btn-primary flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 disabled:opacity-40 shadow-sm whitespace-normal"
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

      {/* Practice-complete popup — prompts the candidate to start the real
          interview once practice ends. Dismissible so they can scroll back
          through the practice thread first. */}
      {showStartPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-success-subtle flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-success" />
            </div>
            <h3 className="tf-section-title mb-1.5">Practice complete!</h3>
            <p className="tf-body-secondary leading-relaxed mb-5">
              Nice — that&apos;s exactly how the real interview flows. When you&apos;re ready, start your interview. All the best!
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onStartInterview}
                disabled={submitting}
                className="tf-btn tf-btn-primary px-6 py-3 rounded-xl text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 shadow-sm whitespace-normal"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                ) : (
                  <>Start Interview <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
              {/* Close the popup and look back over the practice chat first.
                  The footer's Start Interview stays, and closing scrolls it
                  into view (see startPopupWasOpen above). */}
              <button
                type="button"
                onClick={() => setShowStartPopup(false)}
                disabled={submitting}
                className="min-h-10 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline transition-colors disabled:opacity-50"
              >
                Review my practice first
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
