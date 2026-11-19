# Live object detection (phone / prohibited item proctoring)

Detects prohibited objects — primarily **mobile phones** — in the candidate's
camera feed during an AI interview, and records each one as a proctoring
violation that names the **specific item detected**, never a generic "object".

## Setup (required before it does anything)

```bash
npm run fetch:od-model                   # q8, 28 MB — the default, use this
npm run fetch:od-model -- --dtype fp32   # 108 MB
npm run fetch:od-model -- --dtype fp16   # 54 MB — see the f16 warning below
```

> **Do not ship fp16.** It requires the WebGPU `shader-f16` device feature, and
> common candidate hardware does not have it — verified on Intel Gen-9
> integrated graphics, where session creation dies with *"Program Transpose
> requires f16 but the device does not support it"* and proctoring silently does
> nothing. q8 is both the most compatible **and** the smallest.

Vendors two things into `public/`, **both same-origin**:

| Path | What | Size |
|---|---|---|
| `models/object-detection/rf-detr-nano.onnx` | weights (`onnx-community/rfdetr_nano-ONNX`) | 54 MB fp16 |
| `ort/ort.webgpu.min.js` + `.wasm`/`.mjs` siblings | onnxruntime-web runtime | ~27 MB |

**Until both exist the detector fails init and stays dormant** — the rest of the
interview is unaffected. These are deployment artifacts, not source: they must
be present on the server, so run this in your build/deploy step.

Optional overrides:

| Env var | Default |
|---|---|
| `NEXT_PUBLIC_OBJECT_DETECTION_MODEL_URL` | `/models/object-detection/rf-detr-nano.onnx` |
| `NEXT_PUBLIC_ORT_WEBGPU_URL` | *(unset)* — tried first, before `/ort/…`, then jsDelivr |

### Why both are vendored rather than CDN-loaded

This code runs **during a live interview**. A CDN that is slow, down, or blocked
by the candidate's network silently disables proctoring for that session — not
hypothetical: the first production run loaded onnxruntime-web from jsDelivr,
a candidate's network blocked it, `importScripts` threw, and object detection
was off for the entire interview with a single warning line to show for it.

The worker now tries the ORT sources in order (env var → `/ort/` → jsDelivr) and
reports which one it used, so a same-origin miss is visible instead of silent.

## Deploying changes — read this before debugging

Two traps have already burned live interviews:

**1. A stale worker runs while the repo looks correct.** `public/` files got the
default `Cache-Control: public, max-age=14400`, so after a deploy candidates'
browsers and the Cloudflare edge kept the *previous* worker for 4 hours. Fixed
by serving `/workers/*` as `no-store` (next.config.ts). **Also bump
`WORKER_VERSION` in InterviewObjectDetection.ts whenever you edit the worker** —
that busts copies cached before the header existed.

**2. The server serves a stale `public/` snapshot.** Newly *added* public files
404 until the Next server restarts. So: run `npm run fetch:od-model` as part of
build/deploy, and restart afterwards.

When something looks wrong, check what is actually deployed rather than what is
in the repo:

```bash
curl -s https://<host>/workers/objectDetection.worker.js | grep -c 'let ortLib'
curl -sI https://<host>/models/object-detection/rf-detr-nano.onnx | grep -i content-length
```

`28826010` = q8 (correct). `54356067` = fp16, which cannot run without
`shader-f16` — see the warning above.

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

## Measured behaviour (Intel Gen-9 iGPU, q8, 384px)

Benched with `public/od-worker-test.html` against a real interview frame of a
candidate holding a phone up to the webcam:

| | |
|---|---|
| Session create | ~2.1 s |
| Inference | **~2.1 s/frame** (bench also saw 1.8–8.2 s) |
| `shader-f16` | not supported → fp16 model unusable |
| Result on that frame | `laptop` 0.431 → fires `unauthorized_object` |

Two things follow, and both are load-bearing:

**1. The cadence must adapt — and burst on suspicion.** ~2.1 s/frame against the
original fixed 2 s cadence would have queued frames back-to-back.
`DUTY_CYCLE_DIVISOR` now spaces frames at 3× the last measured inference (capped
20 s). But that alone broke recall: the 2-frame confirmation gate at a ~6 s idle
cadence needed an object to stay in frame ~13 s, so a quick glance at a phone was
missed entirely. So the loop polls slowly while the frame looks clean, then
samples **back-to-back** as soon as a watched class appears — corroboration in
~2 inferences instead of ~2 cadences, with the idle duty cycle unchanged.

That combination is what makes the 2-frame gate affordable. Don't lower
`framesToConfirm` to buy recall; the burst already bought it.

### ⚠ The accuracy ceiling — read before tuning thresholds

Measured on this model:

| Scene | Class | Score |
|---|---|---|
| Real phone held to the camera | `cell phone` | **0.297** |
| **Window blinds, no phone present** | `cell phone` | **0.33** |

**The false positive outscored the real phone.** No single threshold separates
them. A cut-off low enough to catch real phones fires SEVERE on background
clutter; one high enough to be safe misses real phones. Both failure modes have
been observed in production.

This is a capability limit of RF-DETR-Nano at 384 px, **not** a tuning bug.
Tuning only moves the damage around. The genuine fixes are, in order:

1. **Fine-tune on webcam-perspective phone images** — by far the biggest win
2. Larger input / larger RF-DETR variant — costs latency, already ~2.1 s/frame
3. Accept phone detection as advisory-only corroboration

Until one of those happens, the two-tier scheme below is damage control, not a
solution. Do not "fix" this by lowering `minConfidence`.

**How the two tiers work:** `cell phone` ≥ 0.50 → severe `phone_detected`
("Mobile phone"); 0.30–0.50 → moderate `unauthorized_object`
("Possible phone (unconfirmed)") with an explicit *confirm in the recording*
note. Nothing in the bench reached 0.50 — that is the honest signal about how
often this model can confidently call a phone.

**2. A phone held close to the lens is often classified `laptop`, not
`cell phone`.** Up close it is just a large dark rectangle. That means it lands
as a **moderate** `unauthorized_object` ("Second laptop or computer in view"),
not a **severe** `phone_detected`. We store what the model actually said rather
than promoting a guess to "phone" — the recruiter still gets a flag with a
timestamp and can confirm in the recording.

If severe-on-every-phone matters more than label accuracy, the fix is
**fine-tuning on webcam-perspective phone images**, not threshold tweaking.
Thresholds are already near the noise floor: the original 0.45 phone / 0.55
laptop cut-offs are precisely why a blatant phone produced zero flags in
production.

## Verified model facts

Parsed from the vendored `rf-detr-nano.onnx` and its `preprocessor_config.json`:

| | |
|---|---|
| Input | `pixel_values` `[batch, 3, height, width]` — H/W **dynamic**, so the configured 384 applies |
| Outputs | `logits [*, 300, 91]`, `pred_boxes [*, 300, 4]` |
| Label space | **91-class sparse COCO** → `cell phone`=77, `tv`=72, `laptop`=73, `remote`=75, `book`=84 |
| Preprocessing | rescale 1/255 only — `do_normalize: false` |
| Decode | 300 queries, per-class **sigmoid** (focal loss), no background class, no NMS |

The worker picks the label space from the logits class dim at runtime rather
than assuming, because the 80- vs 91-class spaces differ by a few indices and
guessing wrong turns `cell phone` into `microwave` — a confidently-labelled lie.

### The preprocessing call, and how to reverse it

`APPLY_IMAGENET_NORM = false` in the worker follows `do_normalize: false`.
Scanning the graph found no separate ImageNet mean/std constants either, so the
normalisation is almost certainly folded into the first conv.

If detections are consistently missing in a case where a phone is plainly in
frame, flipping that flag to `true` is the first thing to try — double- or
un-normalised input degrades quality to near-zero, which looks exactly like
"the candidate had no phone". That is the most dangerous failure mode this
feature has, which is why it gets a named flag rather than an inline constant.

## Before shipping: measure

Load an interview in Chrome and read the console:

```
[INTERVIEW_OBJECT_DETECTION] Ready — webgpu, input 384px, labels coco91, ort /ort/ort.webgpu.min.js
```

- `labels` must read `coco91`. `custom-N` means the export uses a class space
  this code doesn't recognise — detections are dropped rather than mislabelled.
- `ort` should read `/ort/…`. If it reads `https://cdn.jsdelivr.net/…`, the
  same-origin vendoring didn't reach the server; fix that before rollout.

Then confirm per-frame `inferenceMs` on both a typical and a low-tier machine,
and **hold a phone up to the camera** to confirm end-to-end that a violation is
written. If WebGPU inference is not comfortably under ~500 ms, revisit the
model choice.

## Reading the log (this is how you tune it)

All lines use the `[INTERVIEW_OBJECT_DETECTION]` prefix, which is on
`clientLogForwarder`'s allowlist, so they reach the server log too.

```
Ready — webgpu, input 384px, labels coco91, ort /ort/ort.webgpu.min.js
First inference 2134 ms → cadence 6402 ms
frame sees: person 0.684, laptop 0.474, tv 0.238      ← every 30 s, ANY class,
                                                        thresholds ignored
near-miss cell phone score=0.190/0.22 area=0.021/0.0015 — filtered
FLAG unauthorized_object laptop score=0.431 frames=2
```

`frame sees:` is the ground truth and exists specifically to separate three
failure modes that otherwise look identical from the outside — an interview with
no flags:

| Log says | Meaning | Fix |
|---|---|---|
| no watched class at all | model isn't seeing it | resolution / fine-tune |
| `near-miss … filtered` | seen, scored below threshold | lower that threshold |
| `laptop` where you expect a phone | class confusion, working as designed | fine-tune |
| no lines at all | detector never ran | check the advisory row's reason |

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
