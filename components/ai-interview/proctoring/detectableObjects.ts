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

export interface DetectableObjectDef {
  /** EXACT label emitted by the model — this is what we persist verbatim. */
  cocoLabel: string;
  /** Recruiter-facing name shown in the Integrity Check tab. */
  displayLabel: string;
  /** phone_detected → severe; unauthorized_object → moderate. */
  eventType: ObjectEventType;
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
    displayLabel: 'Mobile phone',
    eventType: 'phone_detected',
    minConfidence: 0.45,
    minBoxArea: 0.0015,
    framesToConfirm: 2,
  },
  laptop: {
    cocoLabel: 'laptop',
    displayLabel: 'Second laptop or computer',
    eventType: 'unauthorized_object',
    minConfidence: 0.55,
    minBoxArea: 0.01,
    framesToConfirm: 2,
  },
  tv: {
    cocoLabel: 'tv',
    displayLabel: 'Second screen or monitor',
    eventType: 'unauthorized_object',
    minConfidence: 0.55,
    minBoxArea: 0.01,
    framesToConfirm: 3, // a monitor in the background is often legitimate
  },
  book: {
    cocoLabel: 'book',
    displayLabel: 'Book or printed notes',
    eventType: 'unauthorized_object',
    minConfidence: 0.5,
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
    minConfidence: 0.5,
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
