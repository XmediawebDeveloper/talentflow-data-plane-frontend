/**
 * gazeEstimator — turns one MediaPipe FaceMesh result into "looking away or
 * not", shared by the AI interview (InterviewFaceDetection.ts) and the
 * assessment (hooks/assessmentFaceMonitor.ts) so the two can't drift apart.
 *
 * Pure measurement + per-candidate baseline only. Debouncing (how many
 * consecutive "away" readings start an episode) and what an episode logs stay
 * with each caller — the two modules log episodes differently.
 *
 * BUG03 (2026-10-03): the old thresholds were fractions of the camera FRAME
 * (nose offset > 0.06 of frame width, > 0.08 of frame height). At a normal
 * 45-70 cm laptop distance the face is too small in frame for any real head
 * turn to reach them (left/right unreachable beyond ~35 cm, "up" needed >100°
 * of tilt), so looking away was never detected. Every measure here is
 * normalised by the face's own size, so distance from the camera doesn't matter:
 *   yaw ratio   = nose-tip x offset from the eye-corner midpoint ÷ eye-corner
 *                 span. ≈ 0.32·tan(head yaw): 0.15 ≈ 25° turn.
 *   pitch ratio = where the nose tip sits between forehead (0) and chin (1).
 *                 Looking down → rises, looking up → falls.
 *   eye ratio   = iris centre position between each eye's corners (0..1),
 *                 averaged over both eyes. Catches eyes-only glances.
 *
 * Each candidate's own neutral pose is learned first (median of the first
 * BASELINE_SAMPLES readings — robust to a few glances during calibration), and
 * only a clear deviation from it is flagged. Webcams usually sit above the
 * screen and often off to one side (external monitor), so "facing the screen"
 * is rarely "facing the camera".
 */

type Landmark = { x: number; y: number };

const BASELINE_SAMPLES = 10;
const YAW_DELTA = 0.15;               // ≈ 25° head turn beyond neutral
// Before the baseline exists, only a large absolute turn counts (≈ 38°), so an
// off-centre camera can't false-trigger during calibration.
const YAW_ABS_PRE_BASELINE = 0.25;
const LOOK_DOWN_RATIO_DELTA = 0.10;   // notes / phone on the desk
const LOOK_UP_RATIO_DELTA = 0.08;     // looking up / over the screen
// Eye-only glance: iris shift ≈ 0.4·sin(eye rotation) → 0.18 ≈ 27°. Only
// evaluated while the head is near neutral (< half YAW_DELTA): when the head
// turns, the eyes counter-rotate to stay on the screen, and that shift must not
// be read as "looking away" (≤ ~0.08 at the 12° head limit).
const EYE_DELTA = 0.18;

export interface GazeReading {
  away: boolean;
  /** Image-space direction ("left", "right_up", "down", "profile", …); "" when not away. */
  direction: string;
  /** What tripped it, for the stored violation: cue + deviations from baseline. */
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

export function createGazeEstimator(logPrefix = '[GAZE]'): GazeEstimator {
  const samples = { yaw: [] as number[], pitch: [] as number[], eye: [] as number[] };
  let baseline: { yaw: number; pitch: number; eye: number | null } | null = null;

  return {
    read(lm, faceVisible) {
      // FACE FIRST, GAZE SECOND. When the face detector sees no face, "looking
      // away" must not be judged at all — that's face_missing's warning. FaceMesh
      // (confidence 0.5) can still return landmarks on a frame the detector
      // (0.6) rejects, and a stale "away" streak used to carry on into the
      // no-face stretch, so candidates with no face in the recording were
      // shown "Looking away" instead of "Face not detected".
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

      const yawRatio = (noseTip.x - (eyeAOuter.x + eyeBOuter.x) / 2) / eyeSpan;
      const pitchRatio = (noseTip.y - forehead.y) / faceHeight;
      const eyeRatio = irisPosition(lm, eyeAOuter, eyeAInner, eyeBInner, eyeBOuter);

      const base = baseline;
      // Calibrate only on readings that aren't already a clear look-away (the
      // same large turn that is flagged pre-baseline). Otherwise a candidate
      // who looks away during the first readings teaches the baseline that
      // "away" is their neutral pose — afterwards looking away reads as
      // normal and looking at the screen reads as away.
      if (!base && Math.abs(yawRatio) <= YAW_ABS_PRE_BASELINE) {
        samples.yaw.push(yawRatio);
        samples.pitch.push(pitchRatio);
        if (eyeRatio != null) samples.eye.push(eyeRatio);
        if (samples.yaw.length >= BASELINE_SAMPLES) {
          baseline = {
            yaw: median(samples.yaw),
            pitch: median(samples.pitch),
            eye: samples.eye.length >= BASELINE_SAMPLES / 2 ? median(samples.eye) : null,
          };
          console.log(`${logPrefix} Gaze baseline set`, {
            yaw: round3(baseline.yaw),
            pitch: round3(baseline.pitch),
            eye: baseline.eye != null ? round3(baseline.eye) : null,
          });
        }
      }

      const yawDev = base ? yawRatio - base.yaw : yawRatio;
      const pitchDev = base ? pitchRatio - base.pitch : 0;
      const eyeDev = base && base.eye != null && eyeRatio != null ? eyeRatio - base.eye : 0;

      const isTurned = Math.abs(yawDev) > (base ? YAW_DELTA : YAW_ABS_PRE_BASELINE);
      const isDown = !!base && pitchDev > LOOK_DOWN_RATIO_DELTA;
      const isUp = !!base && pitchDev < -LOOK_UP_RATIO_DELTA;
      const eyesAway = !isTurned && Math.abs(yawDev) < YAW_DELTA / 2 && Math.abs(eyeDev) > EYE_DELTA;

      // Image-space direction (same convention as before: nose/iris toward
      // image-right → "right").
      let direction = '';
      if (isTurned) direction = yawDev > 0 ? 'right' : 'left';
      else if (eyesAway) direction = eyeDev > 0 ? 'right' : 'left';
      if (isUp) direction = direction ? `${direction}_up` : 'up';
      else if (isDown) direction = direction ? `${direction}_down` : 'down';

      return {
        away: isTurned || isUp || isDown || eyesAway,
        direction,
        metrics: {
          cue: isTurned || isUp || isDown ? 'head' : 'eyes',
          yaw_delta: round3(yawDev),
          pitch_delta: round3(pitchDev),
          eye_delta: round3(eyeDev),
          calibrated: !!base,
        },
      };
    },
  };
}
