/**
 * violationTaxonomy — recruiter-facing semantic layer over raw proctoring events.
 *
 * The proctoring pipeline records ~20 engineering event types (see
 * proctoring/InterviewEventBus.ts `ProctoringEventType`). Recruiters/HR don't
 * think in those terms — they reason in a handful of plain questions:
 *   "Was someone else there? Did they leave the screen? Was the camera/mic off?
 *    Did they try to copy or capture the screen?"
 *
 * This module maps each raw event_type to:
 *   - a recruiter-friendly category (the plain question),
 *   - a plain-language label + short description,
 *   - a recruiter severity bucket (serious / moderate / minor / advisory),
 *   - an optional confidence tag (high / possible) for the identity checks that
 *     differ ONLY by a match-score threshold (face_mismatch vs
 *     face_identity_changed, voice_mismatch vs voice_identity_changed).
 *
 * It also turns each event's raw `details` payload (whose keys vary per type)
 * into one plain "what we saw" sentence. Detail keys are documented at each
 * describe() branch; unknown/absent details degrade to an empty string.
 *
 * Pure data + string helpers only (no JSX) so it can be reused by the list
 * view, PDF export, etc. without pulling in React.
 */

export interface ViolationRecord {
  event_type: string;
  severity: string; // backend-recomputed: 'high' | 'medium' | 'low' (legacy minor/moderate/severe)
  timestamp?: string;
  details?: Record<string, unknown>;
}

export type RecruiterSeverity = 'serious' | 'moderate' | 'minor' | 'advisory';
export type Confidence = 'high' | 'possible';
export type CategoryKey =
  | 'someone_else'
  | 'attention'
  | 'device'
  | 'capture'
  | 'ended'
  | 'advisory';

/* ── Category definitions (order = display order) ─────────────────────────── */
export interface CategoryDef {
  key: CategoryKey;
  title: string;
  description: string;
}

export const CATEGORY_ORDER: CategoryKey[] = [
  'ended',
  'someone_else',
  'device',
  'capture',
  'attention',
  'advisory',
];

export const CATEGORIES: Record<CategoryKey, CategoryDef> = {
  ended: {
    key: 'ended',
    title: 'Interview ended early',
    description: 'The candidate left the interview screen, so the session was stopped automatically.',
  },
  someone_else: {
    key: 'someone_else',
    title: 'Another person may have been involved',
    description: 'A voice or face that isn’t the candidate who enrolled at the start of the interview.',
  },
  device: {
    key: 'device',
    title: 'Camera or microphone off or blocked',
    description: 'The camera couldn’t see the candidate, or a device was switched off during the interview.',
  },
  capture: {
    key: 'capture',
    title: 'Tried to copy or capture the interview',
    description: 'Copying text, taking screenshots, or stopping the required screen share.',
  },
  attention: {
    key: 'attention',
    title: 'Left or looked away from the interview',
    description: 'Attention moved off the interview window. Common and often accidental.',
  },
  advisory: {
    key: 'advisory',
    title: 'Environment (advisory — not counted)',
    description: 'Quality hints only. These do not affect the integrity score or the candidate’s result.',
  },
};

/* ── Per-event metadata ───────────────────────────────────────────────────── */
interface EventMeta {
  category: CategoryKey;
  label: string;          // plain, recruiter-facing
  confidence?: Confidence; // only for the two-tier identity checks
}

// Advisory / UI-only / timeline types are excluded from the violation count
// entirely. voice_detected never reaches the backend; session_paused/resumed
// are informational timeline markers the backend also omits from scoring.
export const ADVISORY_TYPES = new Set<string>([
  'background_noise', 'voice_detected', 'session_paused', 'session_resumed',
]);

export const EVENT_META: Record<string, EventMeta> = {
  // Someone else — identity & extra people
  multiple_voices:        { category: 'someone_else', label: 'Another voice in the room' },
  voice_identity_changed: { category: 'someone_else', label: 'A different voice than the candidate', confidence: 'high' },
  voice_mismatch:         { category: 'someone_else', label: 'A different voice than the candidate', confidence: 'possible' },
  face_identity_changed:  { category: 'someone_else', label: 'A different face than the candidate', confidence: 'high' },
  face_mismatch:          { category: 'someone_else', label: 'A different face than the candidate', confidence: 'possible' },
  multiple_faces:         { category: 'someone_else', label: 'Another person on camera' },

  // Device — camera / mic
  face_missing:           { category: 'device', label: 'Face not visible' },
  camera_obstructed:      { category: 'device', label: 'Camera blocked or too dark' },
  camera_disabled:        { category: 'device', label: 'Camera turned off' },
  microphone_disabled:    { category: 'device', label: 'Microphone turned off' },

  // Capture / exfiltration
  copy_attempt:             { category: 'capture', label: 'Copied text' },
  paste_attempt:            { category: 'capture', label: 'Pasted text' },
  screenshot_attempt:       { category: 'capture', label: 'Took a screenshot' },
  screen_recording_attempt: { category: 'capture', label: 'Screen recording detected' },
  screen_share_stopped:     { category: 'capture', label: 'Stopped sharing their screen' },

  // Attention
  gaze_away:       { category: 'attention', label: 'Looked away from the screen' },
  window_blur:     { category: 'attention', label: 'Clicked away from the window' },
  tab_switch:      { category: 'attention', label: 'Switched browser tab or app' },
  fullscreen_exit: { category: 'attention', label: 'Exited fullscreen' },

  // Terminal
  interview_terminated: { category: 'ended', label: 'Interview ended — candidate left the screen' },

  // Advisory / timeline markers
  background_noise: { category: 'advisory', label: 'Background noise' },
  voice_detected:   { category: 'advisory', label: 'Voice activity' },
  session_paused:   { category: 'advisory', label: 'Interview paused' },
  session_resumed:  { category: 'advisory', label: 'Interview resumed' },
};

/* ── Severity ─────────────────────────────────────────────────────────────── */
// Normalise the backend's severity string to three tiers. The backend
// recomputes and stores severity on each record (high/medium/low), so this is
// the authoritative signal — we do NOT re-derive it from the event type.
export function normaliseSeverity(raw?: string): 'severe' | 'moderate' | 'minor' {
  const s = (raw ?? '').toLowerCase();
  if (s === 'severe' || s === 'high' || s === 'critical') return 'severe';
  if (s === 'moderate' || s === 'medium') return 'moderate';
  return 'minor';
}

export function recruiterSeverity(v: ViolationRecord): RecruiterSeverity {
  // Advisory types + any "info"-severity timeline marker are excluded from the
  // counted violations, matching the backend's scoring (utils/proctoring.py).
  if (ADVISORY_TYPES.has(v.event_type)) return 'advisory';
  if ((v.severity ?? '').toLowerCase() === 'info') return 'advisory';
  const s = normaliseSeverity(v.severity);
  return s === 'severe' ? 'serious' : s === 'moderate' ? 'moderate' : 'minor';
}

export function categoryOf(eventType: string): CategoryKey {
  return EVENT_META[eventType]?.category ?? 'attention';
}

export function labelOf(eventType: string): string {
  return EVENT_META[eventType]?.label ?? eventType.replace(/_/g, ' ');
}

export function confidenceOf(eventType: string): Confidence | undefined {
  return EVENT_META[eventType]?.confidence;
}

/* ── Summary ──────────────────────────────────────────────────────────────── */
export interface ViolationSummary {
  raw: number;        // every recorded event
  advisory: number;   // background noise etc. — excluded from `counted`
  counted: number;    // serious + moderate + minor
  serious: number;
  moderate: number;
  minor: number;
  /** true when a strong "someone else" signal is present. */
  someoneElse: boolean;
  terminated: boolean;
}

const SOMEONE_ELSE_SERIOUS = new Set<string>([
  'multiple_voices', 'voice_identity_changed', 'face_identity_changed', 'multiple_faces',
]);

export function summarizeViolations(violations: ViolationRecord[]): ViolationSummary {
  const s: ViolationSummary = {
    raw: violations.length, advisory: 0, counted: 0,
    serious: 0, moderate: 0, minor: 0, someoneElse: false, terminated: false,
  };
  for (const v of violations) {
    if (v.event_type === 'interview_terminated') s.terminated = true;
    if (SOMEONE_ELSE_SERIOUS.has(v.event_type)) s.someoneElse = true;
    const rs = recruiterSeverity(v);
    if (rs === 'advisory') { s.advisory += 1; continue; }
    s.counted += 1;
    if (rs === 'serious') s.serious += 1;
    else if (rs === 'moderate') s.moderate += 1;
    else s.minor += 1;
  }
  return s;
}

/* ── "What we saw": plain sentence from the raw details payload ───────────── */
function num(x: unknown): number | null {
  if (typeof x === 'number' && !Number.isNaN(x)) return x;
  if (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x))) return Number(x);
  return null;
}

const GAZE_DIR: Record<string, string> = {
  left: 'to the left', right: 'to the right', up: 'upward',
  left_up: 'up and to the left', right_up: 'up and to the right',
};

const TAB_METHOD: Record<string, string> = {
  alt_tab: 'used Alt + Tab to switch away',
  cmd_tab: 'used Cmd + Tab to switch away',
  ctrl_tab: 'used Ctrl + Tab to switch away',
};

const BLUR_REASON: Record<string, string> = {
  mouse_left_window: 'the mouse moved outside the interview window',
  alt_f4: 'pressed Alt + F4',
  windows_key: 'pressed the Windows key',
};

const SHARE_REASON: Record<string, string> = {
  candidate_stopped_sharing: 'The candidate stopped sharing their screen.',
  invalid_screen_selection: 'The candidate shared the wrong screen.',
  reshare_declined: 'The candidate declined to resume screen sharing.',
};

// Termination reason → plain sentence. Kept in sync with the candidate portal's
// TERMINATION_MESSAGES / the recruiter banner's REASON_LABELS.
const TERM_REASON: Record<string, string> = {
  key_f11: 'Pressed F11 to exit fullscreen.',
  key_escape: 'Pressed Esc to exit fullscreen.',
  key_alt_tab: 'Used Alt + Tab to switch away from the interview.',
  key_meta: 'Pressed the Windows / ⌘ key.',
  left_screen_fullscreen_exit: 'Exited fullscreen mode.',
  left_screen_tab_hidden: 'Switched to another tab or minimised the window.',
  left_screen_focus_lost: 'Moved focus away from the interview window.',
  left_screen: 'Left the interview screen.',
};

/**
 * One plain-language sentence describing what was actually observed, derived
 * from the event's `details`. Returns '' when there's nothing meaningful to add
 * beyond the label.
 */
export function describeViolation(v: ViolationRecord): string {
  const d = (v.details ?? {}) as Record<string, unknown>;
  switch (v.event_type) {
    case 'multiple_voices': {
      if (d.reason === 'device_in_use_active_meeting')
        return 'Another app was using the microphone before the interview started.';
      return 'A second speaker was heard at the same time as the candidate.';
    }
    case 'voice_identity_changed':
    case 'voice_mismatch': {
      // Server (ECAPA): higher score = more like the enrolled speaker.
      // Client fallback: { similarity }. Both are "higher = more similar".
      const score = num(d.score) ?? num(d.min_window_score) ?? num(d.similarity);
      const tail = v.event_type === 'voice_identity_changed'
        ? 'clearly a different speaker'
        : 'in the uncertain range — could be a poor connection or a second person';
      if (score != null) return `Voice match ${score.toFixed(2)} (higher = more like the candidate) — ${tail}.`;
      return v.event_type === 'voice_identity_changed'
        ? 'The voice did not match the enrolled candidate.'
        : 'The voice partly stopped matching the enrolled candidate.';
    }
    case 'face_identity_changed':
    case 'face_mismatch': {
      // Face uses euclidean distance: higher = LESS like the enrolled candidate.
      const dist = num(d.distance);
      const tail = v.event_type === 'face_identity_changed'
        ? 'clearly a different face'
        : 'somewhat off from the candidate — could be lighting or angle';
      if (dist != null) return `Face match distance ${dist.toFixed(2)} (higher = less like the candidate) — ${tail}.`;
      return v.event_type === 'face_identity_changed'
        ? 'The face on camera did not match the enrolled candidate.'
        : 'The face on camera partly stopped matching the enrolled candidate.';
    }
    case 'multiple_faces': {
      const n = num(d.face_count);
      return n != null ? `${n} faces were visible in the camera.` : 'More than one face was visible in the camera.';
    }
    case 'gaze_away': {
      const dir = typeof d.direction === 'string' ? GAZE_DIR[d.direction] : undefined;
      return dir ? `Looked away ${dir}.` : 'Eyes moved away from the screen.';
    }
    case 'tab_switch': {
      const m = typeof d.method === 'string' ? TAB_METHOD[d.method] : undefined;
      if (m) return `The candidate ${m}.`;
      if (d.hidden) return 'The interview tab was hidden or minimised.';
      return 'Switched to another tab or window.';
    }
    case 'window_blur': {
      const key = (typeof d.reason === 'string' && d.reason) || (typeof d.method === 'string' && d.method) || '';
      const r = BLUR_REASON[key];
      return r ? `The interview window lost focus — ${r}.` : 'The interview window lost focus.';
    }
    case 'fullscreen_exit':
      return 'The candidate left fullscreen mode.';
    case 'copy_attempt':
      return d.action === 'cut' ? 'Cut text from inside the interview.' : 'Copied text from inside the interview.';
    case 'paste_attempt':
      return 'Pasted text into the interview.';
    case 'screenshot_attempt': {
      const key = typeof d.key === 'string' ? d.key : '';
      return key ? `Screenshot shortcut used (${key}).` : 'A screenshot shortcut was pressed.';
    }
    case 'screen_recording_attempt':
      return 'A screen-recording tool was detected.';
    case 'screen_share_stopped': {
      const key = typeof d.reason === 'string' ? d.reason : '';
      return SHARE_REASON[key] ?? 'Screen sharing was stopped (it is required throughout the interview).';
    }
    case 'camera_obstructed': {
      if (d.reason === 'too_dark') return 'The camera view was too dark to see the candidate.';
      if (d.reason === 'too_uniform') return 'The camera view appeared covered or blocked.';
      return 'The camera view was obstructed.';
    }
    case 'face_missing':
      return 'No face was detected by the camera.';
    case 'camera_disabled':
      return 'The camera was switched off.';
    case 'microphone_disabled':
      return 'The microphone was switched off.';
    case 'interview_terminated': {
      const msg = typeof d.message === 'string' && d.message ? d.message : '';
      const reason = typeof d.reason === 'string' ? d.reason : '';
      return msg || TERM_REASON[reason] || 'The candidate left the interview screen.';
    }
    case 'background_noise':
      return 'A noisy environment was detected. This does not affect the result.';
    case 'session_paused':
      return 'The interview was paused.';
    case 'session_resumed':
      return 'The interview resumed.';
    default:
      return '';
  }
}
