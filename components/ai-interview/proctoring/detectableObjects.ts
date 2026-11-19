/**
 * detectableObjects — the single source of truth for WHICH objects the live
 * object detector acts on, and what each one is CALLED.
 *
 * Why this file exists
 * --------------------
 * The detector (RF-DETR-Nano, COCO-pretrained) reports all ~80 COCO classes on
 * every frame. We deliberately act on a small allowlist: a candidate holding a
 * coffee cup is not a violation, and surfacing all 80 classes would bury the
 * real signals in the recruiter's Integrity Check tab.
 *
 * Every violation stores the EXACT class the model emitted (`object_class`)
 * plus the recruiter-facing name (`object_label`). We never collapse a
 * detection to a generic "object detected" — the recruiter must be able to see
 * that it was specifically a phone vs. a second monitor vs. a book, because
 * those mean very different things when reviewing an interview.
 *
 * Adding a class:
 *   1. Add an entry here keyed by the model's exact COCO label.
 *   2. Nothing else. The worker, the hook, the taxonomy and the Integrity Check
 *      tab all read this registry.
 *
 * Deliberately NOT watched:
 *   keyboard / mouse — the candidate's own peripherals are routinely in frame;
 *   these fire constantly and would train recruiters to ignore the category.
 */

/** Which proctoring event a detected class raises. Severity follows the type. */
export type ObjectEventType = 'phone_detected' | 'unauthorized_object';

/**
 * Optional stronger tier for a class: at/above `above`, raise the escalated
 * event instead of the base one.
 *
 * This exists because a single threshold cannot work for phones. Measured on
 * this model (see OBJECT_DETECTION.md): a real phone held to the camera scored
 * **0.297**, while a false positive on window blinds scored **0.33** — the false
 * positive outscored the real thing. So one cut-off either floods recruiters
 * with false SEVERE flags or misses real phones entirely.
 *
 * Two tiers make the uncertainty explicit instead of hiding it: a confident
 * detection is a severe "Mobile phone", a weak one is a moderate "Possible
 * phone" the recruiter is told to verify in the recording. Same shape as the
 * existing face/voice `_mismatch` vs `_identity_changed` split.
 */
export interface EscalationTier {
  above: number;
  eventType: ObjectEventType;
  displayLabel: string;
  framesToConfirm?: number;
}

export interface DetectableObjectDef {
  /** EXACT label emitted by the model — this is what we persist verbatim. */
  cocoLabel: string;
  /** Recruiter-facing name shown in the Integrity Check tab. */
  displayLabel: string;
  /** phone_detected → severe; unauthorized_object → moderate. */
  eventType: ObjectEventType;
  /** Stronger tier, applied when the score clears `escalate.above`. */
  escalate?: EscalationTier;
  /**
   * Boxes smaller than `smallBoxArea` must clear `smallBoxMinConfidence`
   * instead of `minConfidence`. Lets a class keep a low cut-off for the large
   * close-up case it exists for while small background boxes need a firm score.
   */
  smallBoxArea?: number;
  smallBoxMinConfidence?: number;
  /**
   * Minimum sigmoid score to consider. Phones sit lower than the rest on
   * purpose: a phone held at chest height is small, often half-occluded by a
   * hand, and frequently screen-off — the very cases we most want to catch.
   * The consecutive-frame gate below is what keeps the false-positive rate
   * sane, not a high score cut-off.
   */
  minConfidence: number;
  /** Minimum box area as a fraction of the frame — filters speck detections. */
  minBoxArea: number;
  /** Consecutive detections required before the event is emitted. */
  framesToConfirm: number;
}

/**
 * Keyed by the model's exact COCO label string (NOT class id).
 *
 * Matching on the label rather than the numeric id is deliberate: DETR-family
 * models ship in both the 80-class contiguous and the 91-class sparse COCO id
 * spaces, and picking the wrong one silently shifts every class (`cell phone`
 * becomes `microwave`). The worker resolves ids → labels and matches strings,
 * so an id-space mismatch can never mislabel a violation.
 */
export const DETECTABLE_OBJECTS: Record<string, DetectableObjectDef> = {
  'cell phone': {
    cocoLabel: 'cell phone',
    // BASE tier is deliberately hedged. At 0.22 this class fired SEVERE on
    // window blinds at 0.33 — while a genuine phone measured 0.297. Anything in
    // this band is a coin flip, so it must not read as a confirmed phone.
    displayLabel: 'Possible phone (unconfirmed)',
    eventType: 'unauthorized_object',
    minConfidence: 0.30,
    minBoxArea: 0.0015,
    // 3 rather than 2: the extra corroboration is what makes this band tolerable
    // at all, and burst sampling means it still resolves in a few seconds.
    framesToConfirm: 3,
    escalate: {
      // Only a clearly-confident detection earns the severe, self-assured
      // "Mobile phone" flag. Nothing in the bench reached this, which is the
      // honest signal that this model needs fine-tuning for reliable phone
      // calls — see OBJECT_DETECTION.md.
      above: 0.50,
      eventType: 'phone_detected',
      displayLabel: 'Mobile phone',
      framesToConfirm: 2,
    },
  },
  laptop: {
    cocoLabel: 'laptop',
    displayLabel: 'Second laptop or computer',
    eventType: 'unauthorized_object',
    // 0.40, not 0.55: in the same bench a phone filling the frame was
    // classified `laptop` at 0.474 — a close-up phone is a large dark
    // rectangle, and this class is where those land. Catching it as a moderate
    // prohibited-item flag beats missing it entirely.
    minConfidence: 0.40,
    minBoxArea: 0.01,
    // Small boxes (< 10% of the frame) are desks/monitors in the background,
    // not a close-up phone: staging 2026-10-27 flagged a 0.016-area box in the
    // bottom corner of an office at 0.48-0.62 all interview.
    smallBoxArea: 0.10,
    smallBoxMinConfidence: 0.60,
    framesToConfirm: 2,
  },
  tv: {
    cocoLabel: 'tv',
    displayLabel: 'Second screen or monitor',
    eventType: 'unauthorized_object',
    // Kept higher than the rest: the bench showed `tv` firing at ~0.22 on a
    // full-frame box covering the entire image, i.e. it doubles as this model's
    // "background" catch-all. Below ~0.45 it is mostly noise.
    minConfidence: 0.45,
    minBoxArea: 0.01,
    // A monitor in the background is often legitimate, and this class is noisy.
    framesToConfirm: 3,
  },
  book: {
    cocoLabel: 'book',
    displayLabel: 'Book or printed notes',
    eventType: 'unauthorized_object',
    minConfidence: 0.35,
    minBoxArea: 0.006,
    framesToConfirm: 2,
  },
  // `remote` is the class a held phone is most often mistaken for. We watch it
  // so a phone can't slip through as a silent misclassification, but we raise
  // it as MODERATE with an explicitly hedged name rather than as a severe
  // phone flag — calling a TV remote a phone would be a false severe.
  remote: {
    cocoLabel: 'remote',
    displayLabel: 'Handheld device (possibly a phone)',
    eventType: 'unauthorized_object',
    minConfidence: 0.30,
    minBoxArea: 0.0015,
    framesToConfirm: 2,
  },
};

/** Exact COCO labels the worker should keep; everything else is discarded. */
export const WATCHED_COCO_LABELS: string[] = Object.keys(DETECTABLE_OBJECTS);

/** Lowest score worth sending back from the worker at all. */
export const WORKER_SCORE_FLOOR = Math.min(
  ...Object.values(DETECTABLE_OBJECTS).map(o => o.minConfidence),
);

/**
 * Recruiter-facing name for a stored `object_class`.
 *
 * Falls back to a humanised version of whatever the model emitted rather than
 * to a generic word, so a class added to the model but not yet to this registry
 * still shows its real name ("hair drier") instead of "Object".
 */
export function objectDisplayLabel(cocoLabel?: string | null): string {
  if (!cocoLabel) return 'Unidentified object';
  const def = DETECTABLE_OBJECTS[cocoLabel];
  if (def) return def.displayLabel;
  return cocoLabel.charAt(0).toUpperCase() + cocoLabel.slice(1);
}
