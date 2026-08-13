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

import { objectDisplayLabel } from './proctoring/detectableObjects';

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
  | 'prohibited_item'
  | 'attention'
  | 'device'
  | 'capture'
  | 'environment'
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
  'prohibited_item',
  'device',
  'capture',
  'attention',
  'environment',
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
  prohibited_item: {
    key: 'prohibited_item',
    title: 'A phone or other item was visible',
    description: 'The camera saw an item that isn’t allowed during the interview, such as a mobile phone, a second screen, or notes.',
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
  environment: {
    key: 'environment',
    title: 'Mobile environment verification',
    description: 'The candidate’s phone camera check of their physical interview environment.',
  },
  advisory: {
    key: 'advisory',
    title: 'Quality signals (advisory — not counted)',
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
  // Infrastructure diagnostic, never the candidate's fault — must not count
  // against them, but must be visible so "no phone flags" isn't misread as
  // "we checked and found nothing".
  'object_detection_unavailable',
  // A clean environment-verification pass, or the analysis itself failing
  // (infra fault) — the backend already sends severity="info" for both, this
  // is just belt-and-suspenders explicitness matching session_paused/resumed.
  'environment_verification_clear',
  'environment_verification_analysis_failed',
]);

export const EVENT_META: Record<string, EventMeta> = {
  // Someone else — identity & extra people
  multiple_voices:        { category: 'someone_else', label: 'Another voice in the room' },
  voice_identity_changed: { category: 'someone_else', label: 'A different voice than the candidate', confidence: 'high' },
  voice_mismatch:         { category: 'someone_else', label: 'A different voice than the candidate', confidence: 'possible' },
  face_identity_changed:  { category: 'someone_else', label: 'A different face than the candidate', confidence: 'high' },
  face_mismatch:          { category: 'someone_else', label: 'A different face than the candidate', confidence: 'possible' },
  multiple_faces:         { category: 'someone_else', label: 'Another person on camera' },

  // Prohibited items seen on camera. The LABEL stays generic here because the
  // specific item ("Mobile phone", "Book or printed notes") varies per record
  // and comes from details.object_label — see labelOfViolation()/describeViolation(),
  // which are what the Integrity Check tab actually renders.
  phone_detected:      { category: 'prohibited_item', label: 'Mobile phone in view', confidence: 'high' },
  unauthorized_object: { category: 'prohibited_item', label: 'Prohibited item in view', confidence: 'possible' },

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
  picture_in_picture_detected: { category: 'capture', label: 'Used Picture-in-Picture' },

  // Attention
  gaze_away:       { category: 'attention', label: 'Looked away from the screen' },
  window_blur:     { category: 'attention', label: 'Clicked away from the window' },
  tab_switch:      { category: 'attention', label: 'Switched browser tab or app' },
  fullscreen_exit: { category: 'attention', label: 'Exited fullscreen' },

  // Mobile environment verification
  environment_verification_flagged:         { category: 'environment', label: 'Environment check flagged something', confidence: 'possible' },
  environment_verification_clear:           { category: 'environment', label: 'Environment check passed' },
  environment_verification_timed_out:       { category: 'environment', label: 'Environment check not completed' },
  environment_verification_analysis_failed: { category: 'environment', label: 'Environment check analysis unavailable' },

  // Terminal
  interview_terminated: { category: 'ended', label: 'Interview ended — candidate left the screen' },

  // Advisory / timeline markers
  background_noise: { category: 'advisory', label: 'Background noise' },
  object_detection_unavailable: { category: 'advisory', label: 'Phone / item detection did not run' },
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

/**
 * Per-RECORD label. Identical to labelOf() for every event whose meaning is
 * fully carried by its type — but object detections carry the actual thing that
 * was seen in `details`, and a recruiter reviewing an interview needs to read
 * "Mobile phone" or "Book or printed notes", never a generic "object detected".
 *
 * Prefers the stored `object_label` (written at detection time), falls back to
 * the raw model class (`object_class`, e.g. "cell phone"), and only then to the
 * event-type label. So a class the model gains before this app knows about it
 * still shows its real name rather than being flattened into a placeholder.
 */
export function labelOfViolation(v: ViolationRecord): string {
  const d = (v.details ?? {}) as Record<string, unknown>;
  if (v.event_type === 'phone_detected' || v.event_type === 'unauthorized_object') {
    if (typeof d.object_label === 'string' && d.object_label) return `${d.object_label} in view`;
    if (typeof d.object_class === 'string' && d.object_class) {
      return `${objectDisplayLabel(d.object_class)} in view`;
    }
  }
  return labelOf(v.event_type);
}

export function confidenceOf(eventType: string): Confidence | undefined {
  return EVENT_META[eventType]?.confidence;
}

/** Score at/above which an object detection may be shown as high-confidence. */
const OBJECT_HIGH_CONFIDENCE = 0.5;

/**
 * Per-RECORD confidence tag.
 *
 * Object detections must derive this from the ACTUAL detection score, not from
 * the event type. A static per-type tag produced a genuinely misleading row in
 * production: a 33%-confidence phone detection rendered as
 * "Mobile phone in view — HIGH CONFIDENCE — Serious". A recruiter could
 * reasonably reject a candidate on that, and the underlying detection was a
 * false positive on window blinds.
 *
 * Everything else keeps the per-type tag, where the type genuinely encodes the
 * tier (face/voice `_mismatch` vs `_identity_changed`).
 */
export function confidenceOfViolation(v: ViolationRecord): Confidence | undefined {
  if (v.event_type === 'phone_detected' || v.event_type === 'unauthorized_object') {
    const c = num((v.details as Record<string, unknown> | undefined)?.confidence);
    if (c == null) return 'possible';
    return c >= OBJECT_HIGH_CONFIDENCE ? 'high' : 'possible';
  }
  return confidenceOf(v.event_type);
}

/**
 * Key the Integrity Check tab groups records by.
 *
 * For most events the type IS the identity — twelve `gaze_away` records are one
 * thing that happened twelve times. Object detections are different: a laptop,
 * a book and a second monitor all arrive as `unauthorized_object`, and merging
 * them into a single row would tell the recruiter "3 prohibited items" while
 * hiding WHICH. Splitting on the detected class keeps each real-world item as
 * its own row.
 */
export function groupKeyOf(v: ViolationRecord): string {
  if (v.event_type === 'phone_detected' || v.event_type === 'unauthorized_object') {
    const cls = (v.details as Record<string, unknown> | undefined)?.object_class;
    if (typeof cls === 'string' && cls) return `${v.event_type}:${cls}`;
  }
  return v.event_type;
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
  /** true when a mobile phone was confirmed on camera. */
  phoneSeen: boolean;
  terminated: boolean;
}

const SOMEONE_ELSE_SERIOUS = new Set<string>([
  'multiple_voices', 'voice_identity_changed', 'face_identity_changed', 'multiple_faces',
]);

export function summarizeViolations(violations: ViolationRecord[]): ViolationSummary {
  const s: ViolationSummary = {
    raw: violations.length, advisory: 0, counted: 0,
    serious: 0, moderate: 0, minor: 0, someoneElse: false, phoneSeen: false,
    terminated: false,
  };
  for (const v of violations) {
    if (v.event_type === 'interview_terminated') s.terminated = true;
    if (SOMEONE_ELSE_SERIOUS.has(v.event_type)) s.someoneElse = true;
    if (v.event_type === 'phone_detected') s.phoneSeen = true;
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
    case 'picture_in_picture_detected': {
      const via = typeof d.via === 'string' ? d.via : '';
      return via === 'blur_recheck'
        ? 'The interview video was detached into a floating Picture-in-Picture window while the window lost focus.'
        : 'The interview video was detached into a floating Picture-in-Picture window.';
    }
    case 'screen_share_stopped': {
      const key = typeof d.reason === 'string' ? d.reason : '';
      return SHARE_REASON[key] ?? 'Screen sharing was stopped (it is required throughout the interview).';
    }
    case 'camera_obstructed': {
      if (d.reason === 'too_dark') return 'The camera view was too dark to see the candidate.';
      if (d.reason === 'too_uniform') return 'The camera view appeared covered or blocked.';
      return 'The camera view was obstructed.';
    }
    case 'phone_detected':
    case 'unauthorized_object': {
      // details: { object_class, object_label, confidence, box, consecutive_frames, detector }
      // object_class is the model's verbatim class ("cell phone"); object_label
      // is its recruiter-facing name. We show the recruiter-facing name and keep
      // the raw class visible in parentheses so the finding stays auditable —
      // a recruiter challenging a flag can see exactly what the model called it.
      const cls = typeof d.object_class === 'string' ? d.object_class : '';
      const name = typeof d.object_label === 'string' && d.object_label
        ? d.object_label
        : objectDisplayLabel(cls);
      const conf = num(d.confidence);
      const frames = num(d.consecutive_frames);

      const parts = [`The camera saw a ${name.toLowerCase()}`];
      if (cls && cls.toLowerCase() !== name.toLowerCase()) parts.push(` (detected as "${cls}")`);
      parts.push('.');
      if (conf != null) parts.push(` Detection confidence ${Math.round(conf * 100)}%`);
      if (frames != null && frames > 1) {
        parts.push(conf != null ? `, seen in ${frames} consecutive checks.` : ` Seen in ${frames} consecutive checks.`);
      } else if (conf != null) {
        parts.push('.');
      }
      // Below the high-confidence line this detector is genuinely unreliable —
      // it has scored a window blind as a phone at 33%. Say so on the row rather
      // than letting a recruiter read a low percentage as a confirmed finding.
      if (conf != null && conf < OBJECT_HIGH_CONFIDENCE) {
        parts.push(' This is a low-confidence detection — please confirm in the recording before acting on it.');
      }
      return parts.join('');
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
    case 'object_detection_unavailable': {
      // details: { reason }
      const why = typeof d.reason === 'string' && d.reason ? d.reason : 'reason not recorded';
      return `Phone / prohibited-item detection could not start, so nothing was checked for. ` +
        `This does not count against the candidate — but a clean result here means "not checked", ` +
        `not "nothing found". Technical reason: ${why}`;
    }
    case 'environment_verification_flagged':
    case 'environment_verification_clear': {
      // details: { video_url, ai_summary, flagged_items, color_match, id_match }
      const summary = typeof d.ai_summary === 'string' && d.ai_summary ? d.ai_summary : '';
      if (summary) return summary;
      return v.event_type === 'environment_verification_clear'
        ? 'The mobile environment check completed with nothing flagged.'
        : 'The mobile environment check flagged something for review — watch the video to confirm.';
    }
    case 'environment_verification_timed_out':
      return 'The candidate did not complete the mobile environment check within the 3-minute window. The interview resumed automatically.';
    case 'environment_verification_analysis_failed': {
      const why = typeof d.reason === 'string' && d.reason ? d.reason : 'reason not recorded';
      return `The environment-check video was submitted, but automated analysis could not complete. ` +
        `This does not count against the candidate. Technical reason: ${why}`;
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
