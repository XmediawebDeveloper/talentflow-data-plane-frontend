/**
 * gazeEstimator — turns one MediaPipe FaceMesh result into "looking away or
 * not", shared by the AI interview (InterviewFaceDetection.ts) and the
 * assessment (hooks/assessmentFaceMonitor.ts) so the two can't drift apart.
 *
 * Pure measurement + per-candidate calibration only. Debouncing (how many
 * consecutive "away" readings start an episode) and what an episode logs stay
 * with each caller — the two modules log episodes differently.
 *
 * BUG03 (2026-10-03): the old thresholds were fractions of the camera FRAME, so
 * looking away was never detected. Every measure here is normalised by the
 * face's own size:
 *   yaw ratio   = nose-tip x offset from the eye-corner midpoint ÷ eye-corner
 *                 span ≈ K·tan(head yaw).
 *   pitch ratio = where the nose tip sits between forehead (0) and chin (1).
 *                 Looking down → rises, looking up → falls.
 *   eye ratio   = iris centre position between each eye's corners (0..1),
 *                 averaged over both eyes ≈ 0.5 + 0.4·sin(eye rotation).
 *
 * SCREEN GEOMETRY (2026-10-27): reading the question on screen was flagged as
 * "looking away" (Oct 26 test sessions: 11-13 short episodes per interview,
 * each right after a question appeared). Two causes: the "neutral" pose was
 * learned in the first ~10 s while the candidate watched Bina (left of the
 * screen), so reading the chat on the right counted as a deviation; and the
 * thresholds were fixed angles, so a big screen was always partly "away".
 *
 * Now the allowed area IS the screen, as seen from the candidate's eyes:
 *   - screen size from window.screen (CSS px ≈ 1/96 in; OS scaling keeps that
 *     roughly true on laptops and monitors),
 *   - viewing distance from the face's outer-eye-corner span in the image
 *     (adult average ~90 mm, typical webcam ~60° horizontal field of view),
 *   - webcam assumed centred above the screen (laptop / monitor-top camera).
 * Horizontal gaze = head yaw + eye rotation, measured from the camera axis.
 * It is "away" only past the screen edge + H_MARGIN_DEG, so a larger screen or
 * a closer seat gets a proportionally wider allowance. If calibration shows the
 * candidate's gaze centre lies outside the screen (camera off to one side), the
 * centre is learned from calibration instead. Vertically the screen spans from
 * the camera line down to its bottom edge; the head-pitch allowance is that
 * height (+ margin) either way from the calibrated pitch, never stricter than
 * the BUG03 thresholds, so notes / a phone on the desk are still caught.
 */

type Landmark = { x: number; y: number };

export interface ScreenGeometry {
  /** Physical screen size in millimetres. */
  widthMm: number;
  heightMm: number;
}

const BASELINE_SAMPLES = 30;          // ~30 s at 1 reading/s: spans Bina's intro AND reading Q1
const CSS_PX_MM = 25.4 / 96;          // 1 CSS px ≈ 0.265 mm
const OUTER_EYE_SPAN_MM = 90;         // adult outer-eye-corner distance
const CAMERA_HFOV_DEG = 60;           // typical laptop / USB webcam
const DEFAULT_DISTANCE_MM = 550;
const DEFAULT_SCREEN: ScreenGeometry = { widthMm: 340, heightMm: 190 }; // ~15.6" laptop
// Ratio ↔ angle models. The yaw constant uses the upper end of the plausible
// range (0.32-0.42) so a real head turn is never over-estimated into "away".
const YAW_RATIO_PER_TAN = 0.40;
const IRIS_RATIO_PER_SIN = 0.40;
const PITCH_RATIO_PER_SIN = 0.18;     // ≈ 0.10 at 34° (the BUG03 down threshold)
const H_MARGIN_DEG = 12;              // beyond the screen edge before "away"
const V_MARGIN_DEG = 12;
// Never stricter than the BUG03 thresholds (pitch ratio deltas).
const MIN_DOWN_DELTA = 0.10;
const MIN_UP_DELTA = 0.08;
// Before calibration only a very large horizontal look counts.
const PRE_BASELINE_EXTRA_DEG = 15;

const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface GazeReading {
  away: boolean;
  /** Image-space direction ("left", "right_up", "down", "profile", …); "" when not away. */
  direction: string;
  /** What tripped it, for the stored violation: cue + angles vs the allowance. */
  metrics: Record<string, string | number | boolean>;
}

export interface GazeEstimator {
  /**
   * One FaceMesh result. `landmarks` is multiFaceLandmarks[0] (or undefined
   * when the mesh found no face); `faceVisible` is whether the face DETECTOR
   * currently sees a face. Returns null when there is nothing to judge (no
   * visible face — face_missing owns that); the caller must then drop any
   * "away" streak so it can't carry across the no-face stretch.
   */
  read(landmarks: Landmark[] | null | undefined, faceVisible: boolean): GazeReading | null;
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const round3 = (n: number): number => Number(n.toFixed(3));
const round1 = (n: number): number => Number(n.toFixed(1));

/** Physical screen size from the browser, clamped to sane monitor sizes. */
function browserScreen(): ScreenGeometry {
  try {
    const s = typeof window !== 'undefined' ? window.screen : undefined;
    if (s && s.width > 0 && s.height > 0) {
      return {
        widthMm: clamp(s.width * CSS_PX_MM, 200, 800),
        heightMm: clamp(s.height * CSS_PX_MM, 120, 500),
      };
    }
  } catch { /* fall through */ }
  return DEFAULT_SCREEN;
}

/**
 * Horizontal iris position within the eyes, 0 (image-left corner) .. 1
 * (image-right corner), averaged over both eyes. Needs refineLandmarks (iris
 * centres 468 / 473). The iris→eye pairing is chosen by proximity rather than
 * assumed, so a mirrored or relabelled mesh can't swap them. Null when the iris
 * landmarks are absent or an eye is too narrow to measure (closed / blink).
 */
function irisPosition(
  lm: Landmark[], aOuter: Landmark, aInner: Landmark, bInner: Landmark, bOuter: Landmark,
): number | null {
  const i1 = lm[468];
  const i2 = lm[473];
  if (!i1 || !i2 || !aInner || !bInner) return null;
  const aMid = (aOuter.x + aInner.x) / 2;
  const [irisA, irisB] = Math.abs(i1.x - aMid) <= Math.abs(i2.x - aMid) ? [i1, i2] : [i2, i1];
  const within = (iris: Landmark, p: Landmark, q: Landmark): number | null => {
    const lo = Math.min(p.x, q.x);
    const w = Math.max(p.x, q.x) - lo;
    return w > 0.005 ? (iris.x - lo) / w : null;
  };
  const rA = within(irisA, aOuter, aInner);
  const rB = within(irisB, bInner, bOuter);
  return rA != null && rB != null ? (rA + rB) / 2 : null;
}

export function createGazeEstimator(
  logPrefix = '[GAZE]',
  getScreen: () => ScreenGeometry = browserScreen,
): GazeEstimator {
  const samples = { gaze: [] as number[], pitch: [] as number[] };
  let baseline: { gazeCenterDeg: number; pitch: number; cameraCentred: boolean } | null = null;
  let distanceMm: number | null = null;

  return {
    read(lm, faceVisible) {
      // FACE FIRST, GAZE SECOND. When the face detector sees no face, "looking
      // away" must not be judged at all — that's face_missing's warning.
      if (!faceVisible) return null;
      if (!lm) {
        // FaceMesh lost the landmarks while the detector still sees a face:
        // the head is turned too far for the mesh — the most obvious look-away.
        return { away: true, direction: 'profile', metrics: { cue: 'profile' } };
      }

      const noseTip = lm[1];
      const eyeAOuter = lm[33];
      const eyeAInner = lm[133];
      const eyeBInner = lm[362];
      const eyeBOuter = lm[263];
      const forehead = lm[10];
      const chin = lm[152];
      if (!noseTip || !eyeAOuter || !eyeBOuter || !forehead || !chin) return null;

      const eyeSpan = Math.hypot(eyeBOuter.x - eyeAOuter.x, eyeBOuter.y - eyeAOuter.y);
      const faceHeight = chin.y - forehead.y;
      if (eyeSpan < 0.02 || faceHeight < 0.05) return null; // too small to measure

      // ── Geometry: how wide/tall the screen looks from the candidate's eyes ──
      const instDistance = clamp(
        OUTER_EYE_SPAN_MM / (eyeSpan * 2 * Math.tan(CAMERA_HFOV_DEG / 2 / DEG)), 300, 1200,
      );
      distanceMm = distanceMm == null ? instDistance : distanceMm * 0.9 + instDistance * 0.1;
      const D = distanceMm ?? DEFAULT_DISTANCE_MM;
      const screen = getScreen();
      const halfWidthDeg = Math.atan((screen.widthMm / 2) / D) * DEG;
      const heightDeg = Math.atan(screen.heightMm / D) * DEG;

      // ── Measurements ──
      const yawRatio = (noseTip.x - (eyeAOuter.x + eyeBOuter.x) / 2) / eyeSpan;
      const pitchRatio = (noseTip.y - forehead.y) / faceHeight;
      const eyeRatio = irisPosition(lm, eyeAOuter, eyeAInner, eyeBInner, eyeBOuter);
      const headYawDeg = Math.atan(yawRatio / YAW_RATIO_PER_TAN) * DEG;
      const eyeYawDeg = eyeRatio == null
        ? 0
        : Math.asin(clamp((eyeRatio - 0.5) / IRIS_RATIO_PER_SIN, -1, 1)) * DEG;
      const gazeYawDeg = headYawDeg + eyeYawDeg;

      const allowedYawDeg = halfWidthDeg + H_MARGIN_DEG;

      // ── Calibration (gaze centre + neutral pitch) ──
      const base = baseline;
      // Skip readings that are already clearly off-screen so a look-away during
      // calibration can't become the candidate's "normal".
      if (!base && Math.abs(gazeYawDeg) <= allowedYawDeg + PRE_BASELINE_EXTRA_DEG) {
        samples.gaze.push(gazeYawDeg);
        samples.pitch.push(pitchRatio);
        if (samples.gaze.length >= BASELINE_SAMPLES) {
          const gazeCenter = median(samples.gaze);
          // Camera centred over the screen → the screen spans ± halfWidth around
          // the camera axis. Otherwise (side / external camera) centre on where
          // the candidate actually looked during calibration.
          const cameraCentred = Math.abs(gazeCenter) <= halfWidthDeg;
          baseline = { gazeCenterDeg: cameraCentred ? 0 : gazeCenter, pitch: median(samples.pitch), cameraCentred };
          console.log(`${logPrefix} Gaze baseline set`, {
            gaze_center_deg: round1(gazeCenter),
            camera_centred: cameraCentred,
            pitch: round3(baseline.pitch),
            distance_mm: Math.round(D),
            screen_mm: `${Math.round(screen.widthMm)}x${Math.round(screen.heightMm)}`,
            allowed_yaw_deg: round1(allowedYawDeg),
          });
        }
      }

      const centerDeg = base ? base.gazeCenterDeg : 0;
      const yawLimit = base ? allowedYawDeg : allowedYawDeg + PRE_BASELINE_EXTRA_DEG;
      const gazeDev = gazeYawDeg - centerDeg;
      const headDev = headYawDeg - centerDeg;
      const horizAway = Math.abs(gazeDev) > yawLimit;

      // Vertical: screen spans from the camera line to heightDeg below it; the
      // calibrated pitch is somewhere on it, so allow its full height either way.
      const pitchDev = base ? pitchRatio - base.pitch : 0;
      const downLimit = Math.max(MIN_DOWN_DELTA, PITCH_RATIO_PER_SIN * Math.sin((heightDeg + V_MARGIN_DEG) / DEG));
      const upLimit = Math.max(MIN_UP_DELTA, PITCH_RATIO_PER_SIN * Math.sin((heightDeg + V_MARGIN_DEG) / DEG));
      const isDown = !!base && pitchDev > downLimit;
      const isUp = !!base && pitchDev < -upLimit;

      // Image-space direction (nose/iris toward image-right → "right").
      let direction = '';
      if (horizAway) direction = gazeDev > 0 ? 'right' : 'left';
      if (isUp) direction = direction ? `${direction}_up` : 'up';
      else if (isDown) direction = direction ? `${direction}_down` : 'down';

      const headTurned = Math.abs(headDev) > yawLimit;
      return {
        away: horizAway || isUp || isDown,
        direction,
        metrics: {
          cue: headTurned || isUp || isDown ? 'head' : 'eyes',
          gaze_yaw_deg: round1(gazeDev),
          head_yaw_deg: round1(headDev),
          eye_yaw_deg: round1(eyeYawDeg),
          allowed_yaw_deg: round1(yawLimit),
          pitch_delta: round3(pitchDev),
          allowed_pitch_down: round3(downLimit),
          distance_mm: Math.round(D),
          screen_w_mm: Math.round(screen.widthMm),
          calibrated: !!base,
        },
      };
    },
  };
}
