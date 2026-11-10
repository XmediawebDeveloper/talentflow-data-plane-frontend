'use client';

// QR Verification — one environment-verification attempt (the ~10s phone clip
// the candidate records after scanning the QR code). Kept deliberately simple
// and calm for a first-time reviewer:
//
//   1. Status card    — proxy-integrity status, one-line verdict, AI summary,
//      "review only" note; interview reference + recording time in a footer.
//   2. Video + bar     — play, time, next issue; numbered issue markers.
//      Issue snapshots underneath ("Show all" expands every frame).
//   3. Side panel      — four ✓/✕ checks, then numbered issue cards. Click a
//      card to select it (video jumps there, its snapshots are outlined).
//   4. Technical details (collapsed) — colour-by-second and raw flags.
//
// Colour is used sparingly: blue = action / selection, red = a problem,
// green tick = passed; everything else is neutral.
//
// The data handling (voice-item fallback, timestamp parsing, frame matching,
// severity mapping) is unchanged from the previous layout.

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Check, ChevronDown, ChevronRight, Download, Info, Loader2,
  Mic, Monitor, Pause, Play, Smartphone, Users, X,
} from 'lucide-react';

export type EnvVerificationRecordLike = {
  verification_id: string;
  status: string;
  analysis_status: string | null;
  triggered_at: string | null;
  /** When the phone first opened the QR link (null = never scanned). Optional — older backends omit it. */
  opened_at?: string | null;
  submitted_at: string | null;
  video_uploaded: boolean;
  video_url: string | null;
  download_url: string | null;
  video_mime_type: string | null;
  ai_summary: string | null;
  flagged_items: Array<Record<string, unknown>> | null;
  color_match: boolean | null;
  id_match: boolean | null;
  rgb_sequence_results: Array<{ second: number; expected_rgb: string; detected_rgb: string | null; distance: number | null; match: boolean }> | null;
  result_severity: string | null;
  voice_activity_offsets_ms: number[] | null;
};
export type EnvFrameLike = { index: number; url: string | null };

type Props = {
  v: EnvVerificationRecordLike;
  /** Playable source (signed URL or the local-disk blob URL), null if none yet. */
  videoSrc: string | null;
  videoStillLoading: boolean;
  frames: EnvFrameLike[] | undefined;
  framesLoading: boolean;
  framesError: boolean;
  /** Opens the shared full-screen frame viewer. */
  openViewer: (urls: string[], index: number) => void;
  /** Lets the parent keep a ref to this clip's <video> (keyed by verification_id). */
  registerVideo: (el: HTMLVideoElement | null) => void;
  formatTs: (ts?: string) => string;
  /** Which interview this verification belongs to (shown in the footer). */
  interviewRef?: { candidate: string; role: string; sessionId: string };
  /** Interview still live — a pending/opened QR is "waiting", not "not completed". */
  isInProgress?: boolean;
  /** e.g. "Attempt 2" when the interview has more than one attempt. */
  attemptLabel?: string;
  /** Re-run the AI analysis after it failed. */
  onRetryAnalysis?: () => void;
  reanalyzing?: boolean;
  reanalyzeError?: string;
  /** Optional "Watch in recording" link that opens the main interview
   *  recording at the moment the QR was shown (rendered by the parent). */
  watchInRecording?: React.ReactNode;
};

const FRAME_STEP = 0.5;       // stored frames are 2fps → index × 0.5s
const FRAME_MATCH_PAD = 0.4;  // seconds — frames are ~0.5s apart at 2fps
const DISPLAY_END = 5;        // part 1 (laptop screen) = first 5s, part 2 (room) = 5s–10s

const parseApproxRange = (ts: string | null): [number, number] | null => {
  if (!ts) return null;
  const nums = ts.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const a = parseFloat(nums[0]);
  const b = nums.length > 1 ? parseFloat(nums[1]) : a;
  return [Math.min(a, b), Math.max(a, b)];
};
// Legacy rows may carry "pan_left_to_right"/"pan_right_to_left" — both fold into "pan".
const normalizedPhase = (item: Record<string, unknown>): string => {
  const p = String(item.phase ?? '');
  return p === 'pan_left_to_right' || p === 'pan_right_to_left' ? 'pan' : p;
};
const iconForLabel = (label: string, cls = 'w-4 h-4') => {
  const l = label.toLowerCase();
  if (l.includes('voice') || l.includes('speech')) return <Mic className={cls} />;
  if (l.includes('person')) return <Users className={cls} />;
  if (l.includes('phone') || l.includes('tablet')) return <Smartphone className={cls} />;
  if (l.includes('laptop') || l.includes('monitor') || l.includes('screen') || l.includes('display')) return <Monitor className={cls} />;
  return <AlertTriangle className={cls} />;
};
// Severity is shown as words, not colours — only "Serious" is red.
// Confidence says how sure the AI is, not how risky the item is — so low-risk
// items (e.g. a visible mouse cursor) are capped at "Minor" regardless.
const isLowRiskLabel = (label: string) => /\b(mouse\s*)?cursor\b|pointer arrow/i.test(label);
const severityForConfidence = (confidence: string, label = '') => {
  if (isLowRiskLabel(label)) return { label: 'Minor', hint: 'A visible cursor only shows the screen was live — usually nothing to worry about.', cls: 'text-gray-500' };
  if (confidence === 'high') return { label: 'Serious', hint: 'The AI is confident this happened.', cls: 'text-destructive' };
  if (confidence === 'medium') return { label: 'Worth a look', hint: 'The AI thinks this may have happened — please check the video.', cls: 'text-gray-700' };
  return { label: 'Minor', hint: 'Low confidence — usually nothing to worry about.', cls: 'text-gray-500' };
};
// Plain-English name for a #RRGGBB colour. Challenge colours are random RGB
// values (plus one white slot), so this buckets by hue + lightness instead of
// looking up a fixed list.
const colourName = (hex: string | null | undefined): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return 'Unknown';
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (l >= 0.93) return 'White';
  if (l <= 0.1) return 'Black';
  if (s < 0.15) return l > 0.7 ? 'Light grey' : l < 0.35 ? 'Dark grey' : 'Grey';
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  const hue = h < 15 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green'
    : h < 190 ? 'teal' : h < 250 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red';
  if (hue === 'orange' && l < 0.4) return 'Brown';
  const shade = l > 0.7 ? 'Light ' : l < 0.3 ? 'Dark ' : '';
  return shade ? shade + hue : hue.charAt(0).toUpperCase() + hue.slice(1);
};
// The AI summary uses internal terms ("pan phase", "display phase", quoted
// ID). Swap them for words a recruiter understands.
const plainSummary = (s: string) => s
  .replace(/\b(during|in) the pan(ning)? phase\b/gi, 'while the candidate was showing the room')
  .replace(/\b(during|in) the display phase\b/gi, 'while the phone was pointed at the laptop screen')
  .replace(/\bpan(ning)? phase\b/gi, 'room scan')
  .replace(/\bdisplay phase\b/gi, 'screen check')
  .replace(/\bexpected ID\b/gi, 'one-time code')
  .replace(/\bchallenge (ID|code)\b/gi, 'one-time code')
  .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
const fmtSec = (s: number) => `${Math.max(0, s).toFixed(s % 1 === 0 ? 0 : 1)}s`;
// m:ss.s — tenths matter in a 10-second clip.
const fmtClock = (s: number) => {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
};

// 'info' = shown for reference only; never counts as a problem.
function CheckLine({ state, title, hint }: { state: 'pass' | 'fail' | 'na' | 'info'; title: string; hint: string }) {
  return (
    <li className="flex items-center gap-2.5 py-2" title={hint}>
      <span className={`grid place-items-center w-5 h-5 rounded-full shrink-0 ${
        state === 'pass' ? 'bg-success-subtle text-success' : state === 'fail' ? 'bg-destructive-subtle text-destructive' : 'bg-gray-100 text-gray-400'
      }`}>
        {state === 'pass' ? <Check className="w-3 h-3" strokeWidth={3} />
          : state === 'fail' ? <X className="w-3 h-3" strokeWidth={3} />
          : state === 'info' ? <Info className="w-3 h-3" />
          : <span className="w-1.5 h-0.5 bg-current rounded" />}
      </span>
      <span className={`text-sm ${state === 'fail' ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{title}</span>
      {state === 'na' && <span className="ml-auto text-2xs text-gray-400">Not checked</span>}
      {state === 'info' && <span className="ml-auto text-2xs text-gray-400 whitespace-nowrap">Not a violation</span>}
    </li>
  );
}

export default function EnvVerificationStudio({
  v, videoSrc, videoStillLoading, frames, framesLoading, framesError, openViewer, registerVideo, formatTs, interviewRef,
  isInProgress = false, attemptLabel, onRetryAnalysis, reanalyzing = false, reanalyzeError, watchInRecording,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [showAllFrames, setShowAllFrames] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Violation the recruiter clicked on (rows[].i), highlighted everywhere.
  const [selected, setSelected] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const D = duration && duration > 0 ? duration : 10;
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / D) * 100))}%`;

  const seek = (seconds: number, play = true) => {
    const t = Math.min(Math.max(seconds, 0), D);
    setCurrentTime(t);
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = t;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (play) el.play().catch(() => { /* autoplay may be blocked; seek still applies */ });
  };
  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => { /* blocked */ }); else el.pause();
  };
  // Seconds under a mouse x position on the track.
  const timeAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return (Math.min(Math.max(clientX - r.left, 0), r.width) / r.width) * D;
  };
  const ticks = Array.from({ length: Math.floor(D) + 1 }, (_, i) => i);

  const availableFrames = useMemo(() => (frames || []).filter(f => f.url), [frames]);
  const openFrame = (f: EnvFrameLike) => {
    const i = availableFrames.findIndex(fr => fr.index === f.index);
    if (i >= 0) openViewer(availableFrames.map(fr => fr.url as string), i);
  };

  // ── Flagged items (logic unchanged), numbered in time order ─────────────
  // Voice-activity offsets are a deterministic client-side VAD signal. The
  // backend now writes them into `flagged_items`; this synthesis is only a
  // FALLBACK for verifications analyzed before that shipped — skipped when the
  // backend already has a voice entry, so speech isn't listed twice.
  const rows = useMemo(() => {
    const backendAlreadyHasVoiceItems = (v.flagged_items || []).some(
      (it) => typeof it?.label === 'string' && it.label.toLowerCase().includes('voice')
    );
    const voiceItems = backendAlreadyHasVoiceItems ? [] : (v.voice_activity_offsets_ms || []).map((ms) => ({
      label: 'Voice/speech detected',
      confidence: 'medium',
      location: null,
      approx_timestamp: `~${(ms / 1000).toFixed(1)}s`,
      phase: ms < 5000 ? 'display' : 'pan',
      reason: null,
    }));
    const items: Array<Record<string, unknown>> = [...(v.flagged_items || []), ...voiceItems];
    const built = items.map((item, i) => {
      const label = String(item.label ?? 'Unknown');
      const confidence = typeof item.confidence === 'string' ? item.confidence : 'low';
      const location = typeof item.location === 'string' ? item.location : null;
      const approxTimestamp = typeof item.approx_timestamp === 'string' ? item.approx_timestamp : null;
      const phase = normalizedPhase(item);
      const range = parseApproxRange(approxTimestamp);
      const seekSeconds = range ? range[0] : null;
      const baseTs = v.submitted_at || v.triggered_at || '';
      const absoluteTs = baseTs && seekSeconds != null
        ? new Date(new Date(baseTs).getTime() + seekSeconds * 1000).toISOString()
        : null;
      const phaseDescription = phase === 'display'
        ? 'while the phone was pointed at the screen'
        : phase === 'pan' ? 'while the candidate was showing the room' : '';
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : null;
      // Plain-English fallback when the AI gave no reason of its own.
      const isVoice = /voice|speech/i.test(label);
      const description = reason
        ?? (isVoice
          ? `Someone was heard talking${seekSeconds != null ? ` around ${seekSeconds.toFixed(1)}s` : ''}${phaseDescription ? `, ${phaseDescription}` : ''}.`
          : `Seen${location ? ` in the ${location}` : ''}${phaseDescription ? ` ${phaseDescription}` : ''}.`);
      const severity = severityForConfidence(confidence, label);
      // Stored frames (2fps) that fall inside this item's time range.
      let matchedFrames: EnvFrameLike[] = [];
      if (frames && frames.length > 0 && range) {
        const [start, end] = range;
        const inRange = frames.filter(f => {
          const t = f.index * FRAME_STEP;
          return t >= start - FRAME_MATCH_PAD && t <= end + FRAME_MATCH_PAD;
        });
        matchedFrames = inRange.length > 0 ? inRange : frames.filter(f => Math.abs(f.index * FRAME_STEP - start) < 0.5);
      }
      return { i, label, confidence, approxTimestamp, phase, range, seekSeconds, absoluteTs, description, severity, matchedFrames };
    });
    // Number issues in the order they happen in the clip (untimed ones last).
    return built
      .sort((a, b) => (a.seekSeconds ?? Infinity) - (b.seekSeconds ?? Infinity))
      .map((r, n) => ({ ...r, n: n + 1 }));
  }, [v, frames]);

  // Which issue numbers each snapshot belongs to.
  const issuesByFrame = useMemo(() => {
    const m = new Map<number, number[]>();
    rows.forEach(r => r.matchedFrames.forEach(f => m.set(f.index, [...(m.get(f.index) || []), r.n])));
    return m;
  }, [rows]);
  const isActive = (range: [number, number] | null) =>
    !!range && currentTime >= range[0] - FRAME_MATCH_PAD && currentTime <= range[1] + FRAME_MATCH_PAD;

  const rgb = v.rgb_sequence_results || [];
  const rgbPass = rgb.length > 0 ? rgb.every(r => r.match) : null;
  const rgbMatched = rgb.filter(r => r.match).length;
  // The RGB check samples the middle of each second ((second-1)+0.5s); show
  // the stored 2fps frame nearest that moment so the recruiter sees exactly
  // what the camera saw for that colour.
  const frameForSecond = (second: number): EnvFrameLike | null => {
    if (!frames || frames.length === 0) return null;
    const t = second - 0.5;
    let best: EnvFrameLike | null = null;
    for (const f of frames) {
      if (!best || Math.abs(f.index * FRAME_STEP - t) < Math.abs(best.index * FRAME_STEP - t)) best = f;
    }
    return best && Math.abs(best.index * FRAME_STEP - t) <= 0.5 ? best : null;
  };
  const timedRows = rows.filter(r => r.range && r.seekSeconds != null);
  // Next flagged moment after the playhead (wraps to the first).
  const nextIssue = () => {
    const times = timedRows.map(r => r.seekSeconds as number).sort((a, b) => a - b);
    const next = times.find(t => t > currentTime + 0.05) ?? times[0];
    if (next != null) seek(next);
  };
  const voiceCount = (v.voice_activity_offsets_ms || []).length;
  const visualIssues = rows.filter(r => !/voice|speech/i.test(r.label)).length;
  const analysing = v.analysis_status === 'pending' || v.analysis_status === 'running';
  const analysed = v.analysis_status === 'done';
  const liveCheck = v.color_match ?? rgbPass;
  // A failed verification code needs review on its own, even if the AI found
  // nothing. Colour mismatch deliberately does NOT — phone cameras shift
  // colours, and the backend excludes colour from result_severity too.
  const checksFailed = v.id_match === false;
  const flagged = (analysed && v.result_severity === 'flagged') || (v.video_uploaded && checksFailed);

  // What happened on the phone when no video arrived. pending/opened rows only
  // count as "waiting" while the interview is still live; after it ends they're final.
  const waitingOnPhone = !v.video_uploaded && isInProgress && (v.status === 'pending' || v.status === 'opened');
  const notCompleted = !v.video_uploaded && !waitingOnPhone && (v.status === 'expired' || v.status === 'pending' || v.status === 'opened');
  const uploadFailed = !v.video_uploaded && !waitingOnPhone && !notCompleted;
  const notUploadedMessage = waitingOnPhone
    ? (v.status === 'opened'
        ? 'QR scanned — waiting for the candidate to finish recording…'
        : 'Waiting for the candidate to scan the QR code…')
    : notCompleted
    ? (v.opened_at
        ? 'The candidate opened the link on their phone but did not submit a recording before time ran out.'
        : 'The candidate did not scan the QR code before it expired.')
    : 'The candidate submitted, but the video upload failed.';
  const secondsBetween = (a?: string | null, b?: string | null) => {
    if (!a || !b) return null;
    const d = (new Date(b).getTime() - new Date(a).getTime()) / 1000;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
  };
  const timeToScan = secondsBetween(v.triggered_at, v.opened_at);

  const statusLabel = waitingOnPhone ? 'In progress'
    : notCompleted ? 'Not completed'
    : uploadFailed ? 'Upload failed'
    : flagged ? 'Needs review'
    : analysing ? 'In progress'
    : v.analysis_status === 'error' ? 'Not checked'
    : analysed ? 'Clear'
    : 'Pending';
  const title = !v.video_uploaded ? notUploadedMessage
    : flagged ? (rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'thing needs' : 'things need'} your review`
        : v.id_match === false ? 'The verification code could not be read — please review'
        : 'Please watch the video to confirm')
    : analysing ? 'Checking the video…'
    : v.analysis_status === 'error' ? 'We could not check this video — please watch it yourself'
    : analysed ? 'No problems found'
    : 'Waiting for the review';

  // Clicking a violation selects it: highlight it and jump the video there.
  const selectIssue = (r: { i: number; seekSeconds: number | null }) => {
    setSelected(r.i);
    if (r.seekSeconds != null) seek(r.seekSeconds, false);
  };
  const selectedRow = rows.find(r => r.i === selected) || null;
  const selectedFrames = new Set((selectedRow?.matchedFrames || []).map(f => f.index));
  // Snapshots: by default only the ones tied to an issue (all if none are).
  const issueFrames = (frames || []).filter(f => issuesByFrame.has(f.index));
  const shownFrames = showAllFrames || issueFrames.length === 0 ? (frames || []) : issueFrames;
  const recordedAt = v.submitted_at || v.triggered_at;

  return (
    <div className="tf-card-soft overflow-hidden">
      {/* 1. Status — neutral card, colour only on the status pill */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold uppercase tracking-wide text-gray-500">QR verification</span>
              {attemptLabel && <span className="text-2xs font-semibold text-gray-500">· {attemptLabel}</span>}
              <span className={`inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full ${
                flagged || uploadFailed ? 'bg-destructive-subtle text-destructive'
                  : notCompleted ? 'bg-brand-orange/10 text-brand-orange-deep'
                  : analysed ? 'bg-success-subtle text-success' : 'bg-gray-100 text-gray-600'
              }`}>
                {(analysing || waitingOnPhone) && <Loader2 className="w-3 h-3 animate-spin" />}
                {statusLabel}
              </span>
              <span
                className="text-gray-400 cursor-help"
                title={'How this check works:\n'
                  + '1. The candidate scans a QR code and records a 10-second video with their phone.\n'
                  + '2. First 5 seconds: the phone points at the laptop. The laptop shows only a plain colour and a one-time code, so any other app, AI tool or popup is easy to spot.\n'
                  + '3. Last 5 seconds: the candidate shows the room, to check for other people, phones or screens.\n'
                  + '4. The phone microphone also listens for talking.\n\n'
                  + '"Needs review" means the AI saw something worth checking — watch the video to confirm. A colour mismatch alone is not a violation.'}
              >
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-bold text-gray-900 leading-snug">{title}</h3>
            {v.ai_summary && <p className="mt-1 text-sm text-gray-600 leading-relaxed">{plainSummary(v.ai_summary)}</p>}
            <div className="mt-2 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>Shown <span className="font-mono">{v.triggered_at ? formatTs(v.triggered_at) : '—'}</span></span>
              <span className="inline-flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                Scanned{' '}
                {v.opened_at ? (
                  <>
                    <span className="font-mono">{formatTs(v.opened_at)}</span>
                    {timeToScan != null && <span className="text-gray-400">({timeToScan}s later)</span>}
                  </>
                ) : <span className="text-gray-400">—</span>}
              </span>
              <span className="inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-gray-400" />
                Submitted{' '}
                {v.submitted_at ? <span className="font-mono">{formatTs(v.submitted_at)}</span> : <span className="text-gray-400">—</span>}
              </span>
              {watchInRecording}
            </div>
            {v.analysis_status === 'error' && v.video_uploaded && onRetryAnalysis && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onRetryAnalysis}
                  disabled={reanalyzing}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-blue ring-1 ring-brand-blue/30 hover:bg-brand-blue/5 disabled:opacity-50"
                >
                  {reanalyzing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Retry analysis
                </button>
                {reanalyzeError && <span className="text-xs text-destructive">{reanalyzeError}</span>}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">For your review only — this does not change the candidate&apos;s result.</p>
          </div>
          {v.download_url && (
            <a
              href={v.download_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="self-start inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 shrink-0"
            >
              <Download className="w-4 h-4" /> Download video
            </a>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr] gap-5 p-4 sm:p-5 items-start">
        {/* 2. Video + bar */}
        <section className="rounded-xl border border-gray-200 overflow-hidden min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="bg-gray-900">
            {!v.video_uploaded ? (
              <div className="aspect-video grid place-items-center text-sm text-gray-300 px-6 text-center">{notUploadedMessage}</div>
            ) : videoStillLoading ? (
              <div className="aspect-video grid place-items-center text-sm text-gray-300">
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading video…</span>
              </div>
            ) : !videoSrc ? (
              <div className="aspect-video grid place-items-center text-sm text-gray-300">The video is not available.</div>
            ) : (
              <video
                ref={(el) => { videoRef.current = el; registerVideo(el); }}
                controls
                preload="metadata"
                className="w-full aspect-video bg-black"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setDuration(d);
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
              >
                <source src={videoSrc} type={v.video_mime_type || 'video/webm'} />
              </video>
            )}
          </div>

          <div className="px-4 pt-3 pb-3 space-y-2 bg-white">
            {/* Controls — play, time, next issue */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!videoSrc}
                aria-label={playing ? 'Pause' : 'Play'}
                className="grid place-items-center w-8 h-8 rounded-full bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-40"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-px" />}
              </button>
              <span className="font-mono text-sm tabular-nums text-gray-900">
                {fmtClock(currentTime)} <span className="text-gray-400">/ {fmtClock(D)}</span>
              </span>
              {timedRows.length > 0 && (
                <button
                  type="button"
                  onClick={nextIssue}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                >
                  Next issue <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Track — neutral, numbered markers, playhead */}
            <div
              ref={trackRef}
              className="relative pt-6 cursor-pointer select-none"
              onClick={(e) => seek(timeAt(e.clientX), false)}
              onMouseMove={(e) => setHoverT(timeAt(e.clientX))}
              onMouseLeave={() => setHoverT(null)}
              title="Click to jump to a moment"
            >
              <div className="relative h-8 rounded-md bg-gray-100 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gray-200/70" style={{ width: pct(currentTime) }} />
                <div className="absolute inset-y-0 w-px bg-gray-300" style={{ left: pct(Math.min(DISPLAY_END, D)) }} />
                {timedRows.map(r => (
                  <button
                    key={r.i}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); selectIssue(r); }}
                    title={`Issue ${r.n}: ${r.label} · ${fmtSec(r.seekSeconds as number)}`}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold text-white ring-2 ring-white ${
                      selected === r.i ? 'bg-brand-blue' : 'bg-gray-800'
                    }`}
                    style={{ left: pct(r.seekSeconds as number) }}
                  >
                    {r.n}
                  </button>
                ))}
                {hoverT != null && (
                  <div className="pointer-events-none absolute inset-y-0 w-px bg-gray-400" style={{ left: pct(hoverT) }} />
                )}
              </div>
              {/* Playhead + time bubble */}
              <div className="pointer-events-none absolute top-0 bottom-0 transition-[left] duration-150" style={{ left: pct(currentTime) }}>
                <span className="absolute top-0 -translate-x-1/2 rounded bg-brand-blue px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white whitespace-nowrap">
                  {fmtClock(currentTime)}
                </span>
                <span className="absolute top-5 bottom-0 -translate-x-1/2 w-0.5 bg-brand-blue" />
              </div>
              {hoverT != null && (
                <span
                  className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-gray-600 ring-1 ring-gray-200"
                  style={{ left: pct(hoverT), display: Math.abs(hoverT - currentTime) < D * 0.06 ? 'none' : undefined }}
                >
                  {fmtClock(hoverT)}
                </span>
              )}
              {/* Ruler: a timestamp every second */}
              <div className="relative h-4 mt-1">
                {ticks.map(t => (
                  <span key={t} className="absolute top-0 -translate-x-1/2 text-[10px] font-mono tabular-nums text-gray-400" style={{ left: pct(t) }}>
                    {t}s
                  </span>
                ))}
              </div>
            </div>
            <p className="text-2xs text-gray-400">
              0–{DISPLAY_END}s: phone pointed at the laptop screen · {DISPLAY_END}s onward: room scan · numbers = issues
            </p>
          </div>
        </section>

        {/* 3. Side panel — checks, then issues */}
        <aside className="space-y-4 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          <section className="rounded-xl border border-gray-200 px-4 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">What we checked</h4>
            <ul className="divide-y divide-gray-100">
              <CheckLine
                state={v.id_match === null ? 'na' : v.id_match ? 'pass' : 'fail'}
                title="Verification code matched"
                hint="The code shown on the laptop screen matched this session."
              />
              <CheckLine
                state={liveCheck === null ? 'na' : liveCheck ? 'pass' : 'info'}
                title={rgb.length > 0 ? `Screen colours seen (${rgbMatched}/${rgb.length})` : 'Screen colours seen'}
                hint="The plain colours on the laptop screen showed up in the video. For reference only — phone cameras can change colours, so a mismatch is not a violation."
              />
              <CheckLine
                state={!analysed ? 'na' : visualIssues === 0 ? 'pass' : 'fail'}
                title="Nothing suspicious seen"
                hint="No other people, phones, extra monitors or AI tools."
              />
              <CheckLine
                state={v.voice_activity_offsets_ms == null && !analysed ? 'na' : voiceCount === 0 ? 'pass' : 'fail'}
                title="No talking heard"
                hint="Nobody was heard speaking during the recording."
              />
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Needs your review{rows.length > 0 ? ` (${rows.length})` : ''}
            </h4>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">{analysing ? 'Issues will appear here after the check.' : 'Nothing was flagged.'}</p>
            ) : (
              <ol className="space-y-2">
                {rows.map((r) => {
                  const active = selected === r.i || isActive(r.range);
                  return (
                    <li
                      key={r.i}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected === r.i}
                      onClick={() => selectIssue(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectIssue(r); } }}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                        active ? 'border-brand-blue bg-brand-blue/[0.03]' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`grid place-items-center w-5 h-5 mt-0.5 rounded-full text-[10px] font-bold text-white shrink-0 ${active ? 'bg-brand-blue' : 'bg-gray-800'}`}>{r.n}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                              <span className="text-gray-400">{iconForLabel(r.label, 'w-3.5 h-3.5')}</span>
                              {r.label}
                            </span>
                            <span title={r.severity.hint} className={`text-2xs font-semibold whitespace-nowrap ${r.severity.cls}`}>{r.severity.label}</span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-gray-600 break-words">{r.description}</p>
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            {r.seekSeconds != null && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelected(r.i); seek(r.seekSeconds as number); }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline underline-offset-2"
                              >
                                <Play className="w-3 h-3" /> Watch at {fmtSec(r.seekSeconds)}
                              </button>
                            )}
                            {r.absoluteTs && <span className="text-2xs font-mono text-gray-400">{formatTs(r.absoluteTs)}</span>}
                            {r.matchedFrames.length > 0 && r.matchedFrames[0].url && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(r.i);
                                  const urls = r.matchedFrames.filter(f => f.url).map(f => f.url as string);
                                  if (urls.length) openViewer(urls, 0);
                                }}
                                className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                                title="View snapshots of this moment"
                              >
                                <Camera className="w-3.5 h-3.5" /> {r.matchedFrames.length}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>

        {/* Snapshots — issue frames first, "Show all" for the rest */}
        <section className="rounded-xl border border-gray-200 p-4 min-w-0 lg:col-start-1 lg:row-start-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {showAllFrames || issueFrames.length === 0 ? 'Snapshots' : 'Snapshots of the issues'}
            </h4>
            {issueFrames.length > 0 && (frames || []).length > issueFrames.length && (
              <button
                type="button"
                onClick={() => setShowAllFrames(s => !s)}
                className="text-xs font-semibold text-brand-blue hover:underline underline-offset-2"
              >
                {showAllFrames ? 'Show issues only' : `Show all ${(frames || []).length}`}
              </button>
            )}
          </div>
          {framesLoading || (!frames && !framesError) ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-video rounded-md bg-gray-100 animate-pulse" />)}
            </div>
          ) : framesError ? (
            <p className="text-sm text-gray-500">We could not load the snapshots.</p>
          ) : !frames || frames.length === 0 ? (
            <p className="text-sm text-gray-500">No snapshots were saved for this video.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {shownFrames.map((f) => {
                const t = f.index * FRAME_STEP;
                const issues = issuesByFrame.get(f.index) || [];
                return (
                  <button
                    key={f.index}
                    type="button"
                    disabled={!f.url}
                    onClick={() => openFrame(f)}
                    title={`Snapshot at ${fmtSec(t)}${issues.length ? ` · issue ${issues.join(', ')}` : ''}`}
                    className={`relative aspect-video rounded-md overflow-hidden bg-gray-100 hover:opacity-90 disabled:cursor-not-allowed ${
                      selectedFrames.has(f.index) ? 'ring-2 ring-brand-blue ring-offset-1' : 'ring-1 ring-gray-200'
                    }`}
                  >
                    {f.url
                      ? <img src={f.url} alt={`Snapshot at ${fmtSec(t)}`} className="w-full h-full object-cover" />
                      : <span className="absolute inset-0 grid place-items-center text-2xs text-gray-400">unavailable</span>}
                    <span className="absolute bottom-1 left-1 text-[10px] font-mono text-white bg-black/50 px-1 rounded">
                      {fmtSec(t)}{issues.length ? ` · #${issues[0]}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Technical details — collapsed */}
        <section className="rounded-xl border border-gray-200 overflow-hidden min-w-0 lg:col-start-1 lg:row-start-3">
          <button
            type="button"
            onClick={() => setShowTech(s => !s)}
            aria-expanded={showTech}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50"
          >
            <span>Technical details</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showTech ? 'rotate-180' : ''}`} />
          </button>
          {showTech && (
            <div className="px-4 pb-4 pt-3 space-y-4 border-t border-gray-100">
              {rgb.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">
                    Colour check, second by second · {rgbMatched}/{rgb.length} matched
                  </p>
                  <div className="flex gap-2 mb-2.5 p-2.5 rounded-md bg-gray-50 ring-1 ring-gray-200 text-xs text-gray-600 leading-relaxed">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden />
                    <div className="space-y-1">
                      <p>
                        <span className="font-medium text-gray-700">Why plain colours?</span>{' '}
                        A plain screen makes any other app, AI tool or popup easy to spot.
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">A colour mismatch is not a violation.</span>{' '}
                        Phone cameras can change colours (white may look grey). Real issues are listed
                        under &ldquo;Needs your review&rdquo;.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {rgb.map((r) => {
                      const f = frameForSecond(r.second);
                      const expectedName = colourName(r.expected_rgb);
                      const tip = r.detected_rgb
                        ? `Expected ${expectedName} (${r.expected_rgb}), camera saw ${colourName(r.detected_rgb)} (${r.detected_rgb}) · distance ${r.distance ?? '—'}`
                        : `Expected ${expectedName} (${r.expected_rgb}) — no frame could be read for this second`;
                      return (
                        <div
                          key={r.second}
                          title={tip}
                          className={`rounded-md overflow-hidden ring-1 text-xs ${r.match ? 'ring-gray-200' : 'ring-2 ring-destructive'}`}
                        >
                          <button
                            type="button"
                            onClick={() => f?.url && openFrame(f)}
                            disabled={!f?.url}
                            aria-label={`Open frame for second ${r.second}`}
                            className="block w-full aspect-video bg-gray-100 hover:opacity-90 disabled:cursor-default"
                          >
                            {f?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={f.url} alt={`Camera frame at ${r.second - 0.5}s`} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <span className="flex w-full h-full items-center justify-center text-2xs text-gray-400">
                                {framesLoading ? 'Loading…' : 'No frame'}
                              </span>
                            )}
                          </button>
                          <div className="px-2 py-1.5 space-y-0.5">
                            <p className="text-gray-500">Sec {r.second}</p>
                            <p className="flex items-center gap-1.5 text-gray-800 font-medium">
                              <span className="w-3 h-3 shrink-0 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: r.expected_rgb }} />
                              <span className="truncate">{expectedName}</span>
                            </p>
                            <p className={r.match ? 'text-gray-600' : 'font-semibold text-destructive'}>
                              {r.match ? '✓ match' : '✗ mismatch'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {rows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Raw flags</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {rows.map(r => (
                      <li key={r.i} className="font-mono">
                        #{r.n} · {r.label} · confidence={r.confidence} · time={r.approxTimestamp ?? '—'}
                        {r.absoluteTs ? ` · ${formatTs(r.absoluteTs)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rgb.length === 0 && rows.length === 0 && (
                <p className="text-xs text-gray-500">No extra details for this video.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Footer — interview reference + recording time */}
      <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 text-2xs text-gray-500 break-words">
        {interviewRef && (
          <>
            {interviewRef.candidate}{interviewRef.role ? ` · ${interviewRef.role}` : ''}
            {' · '}Session <span className="font-mono">{interviewRef.sessionId}</span>
            {' · '}Verification <span className="font-mono">{v.verification_id}</span>
          </>
        )}
        {recordedAt && <>{interviewRef ? ' · ' : ''}Recorded {formatTs(recordedAt)}</>}
      </div>
    </div>
  );
}
