# Live object detection (phone / prohibited item proctoring)

Detects prohibited objects — primarily **mobile phones** — in the candidate's
camera feed during an AI interview, and records each one as a proctoring
violation that names the **specific item detected**, never a generic "object".

## Setup (required before it does anything)

```bash
npm run fetch:od-model            # fp16, ~60 MB
npm run fetch:od-model -- --dtype q8   # ~30 MB, faster download
```

This vendors RF-DETR-Nano into `public/models/object-detection/rf-detr-nano.onnx`.
**Until that file exists the detector fails init and stays dormant** — the rest of
the interview is unaffected.

Optional overrides:

| Env var | Default |
|---|---|
| `NEXT_PUBLIC_OBJECT_DETECTION_MODEL_URL` | `/models/object-detection/rf-detr-nano.onnx` |
| `NEXT_PUBLIC_ORT_WEBGPU_URL` | jsDelivr `onnxruntime-web@1.27.0/dist/ort.webgpu.min.js` |

Point `NEXT_PUBLIC_ORT_WEBGPU_URL` at a same-origin copy for CSP-strict or
air-gapped deployments.

## Architecture

| Piece | Role |
|---|---|
| `detectableObjects.ts` | The allowlist + display names. **Single source of truth** — add classes here only. |
| `public/workers/objectDetection.worker.js` | ORT/WebGPU inference, DETR decode, allowlist filtering. Off the main thread. |
| `InterviewObjectDetection.ts` | Cadence, consecutive-frame confirmation, per-class re-arm, model prefetch. |
| `InterviewEventBus.ts` | `phone_detected` (severe) / `unauthorized_object` (moderate). |
| `violationTaxonomy.ts` | Recruiter naming: `labelOfViolation`, `groupKeyOf`, `describeViolation`. |
| `IntegrityCheckTab.tsx` | The **Phone / item** category, per-class rows, phone verdict. |

Wired in `InterviewUI.tsx` next to `faceDetection`, sharing the same video element.

## What gets stored

Each violation's `details` carries the model's own class string, so a recruiter
(or an audit) can always see exactly what was detected:

```json
{
  "object_class": "cell phone",
  "object_label": "Mobile phone",
  "confidence": 0.812,
  "box": [0.4131, 0.6022, 0.0714, 0.1338],
  "consecutive_frames": 2,
  "detector": "rf-detr-nano"
}
```

`object_class` is verbatim from the model; `object_label` is the recruiter-facing
name. The Integrity Check tab renders the label and shows the raw class in
parentheses, so a challenged flag stays auditable.

## Watched classes

| COCO class | Shown as | Event | Severity |
|---|---|---|---|
| `cell phone` | Mobile phone | `phone_detected` | **Severe** |
| `laptop` | Second laptop or computer | `unauthorized_object` | Moderate |
| `tv` | Second screen or monitor | `unauthorized_object` | Moderate |
| `book` | Book or printed notes | `unauthorized_object` | Moderate |
| `remote` | Handheld device (possibly a phone) | `unauthorized_object` | Moderate |

`remote` is watched because it is the class a held phone is most often mistaken
for — flagging it as a hedged moderate beats letting a phone slip through as a
silent misclassification, and beats calling a TV remote a phone.

`keyboard` and `mouse` are deliberately **not** watched: the candidate's own
peripherals are routinely in frame.

## Browser load

- **Steady state: low.** One frame every 2 s (4 s on low-tier devices), in a
  worker. The main thread only does `createImageBitmap` + a transfer.
- **Front-loaded: the download.** 30–60 MB, once, cached. Prefetched during
  System Check (`prefetchObjectDetectionModel`) so the interview never waits.
- **Memory:** ~150–250 MB additional in the tab.

## WebGPU is required — on purpose

RF-DETR is a Deformable-DETR derivative, and deformable attention is a known
pathological case for onnxruntime-web's WASM backend
([onnxruntime#22425](https://github.com/microsoft/onnxruntime/issues/22425)
reports ~12 s/frame). Falling back to WASM would stall a live interview, so
without WebGPU the detector reports unavailable and does not run.

Practically: works on Chrome/Edge/Brave; does not run on Safari or Firefox
without WebGPU enabled.

**A session with no phone flags is not proof of a clean session** — check the
console for `[INTERVIEW_OBJECT_DETECTION] Unavailable:` to tell "nothing
detected" apart from "detector never ran".

## Before shipping: measure

The WASM caveat above means the WebGPU path's real latency is the thing to
verify first. Load an interview in Chrome and read the console:

```
[INTERVIEW_OBJECT_DETECTION] Ready — webgpu, input 384px, labels coco91
```

If `labels` reads `custom-N`, the export uses a class space this code doesn't
recognise and detections will be dropped rather than mislabelled — fix the label
map in the worker before relying on it.

Then confirm per-frame `inferenceMs` on both a typical and a low-tier machine.
If WebGPU inference is not comfortably under ~500 ms, revisit the model choice
before rollout.

## Tuning

Thresholds live in `detectableObjects.ts` (`minConfidence`, `minBoxArea`,
`framesToConfirm`). Phones intentionally use a lower score threshold and a much
smaller minimum box area than the other classes — a phone held at chest height
is small and often half-occluded. The consecutive-frame gate, not a high score
cut-off, is what keeps false positives down.

## Licensing

RF-DETR is **Apache-2.0**. This matters: the weights ship to the candidate's
browser, so the AGPL-3.0 Ultralytics YOLO family would require a commercial
licence here. If you later switch to YOLO11n, resolve that first.
