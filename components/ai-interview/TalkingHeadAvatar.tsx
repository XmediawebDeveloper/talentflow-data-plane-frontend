"use client";

/**
 * TalkingHeadAvatar — wrapper around the TalkingHead library.
 *
 * Professional recruiter avatar with native lip-sync, friendly smile,
 * straight pose (arms at sides), maximum eye contact, no emoji gestures.
 *
 * Key fixes:
 * - Pose animation template replaced to ONLY use "straight" (never "side"/"hip")
 * - Eye animation template zeroed out + per-frame bone enforcement
 * - AudioContext from user gesture injected into TalkingHead for audio playback
 */

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";
import { Loader2 } from 'lucide-react';

export interface TalkingHeadHandle {
  streamStart(sampleRate: number, onAudioEnd: () => void): void;
  streamAudio(pcmData: ArrayBuffer): void;
  streamStop(): void;
  /** Signal that no more audio chunks will arrive — worklet plays remaining buffer then ends */
  notifyEnd(): void;
  /** Feed accumulated text so word-level visemes can be generated from audio timing */
  setText(text: string): void;
  /** Optional live viseme override driven by the InterviewUI amplitude loop. */
  applyVisemeLive?(viseme: string, value: number): void;
  /**
   * Push the viseme timing anchor forward by `ms`.
   *
   * Lip-sync is paced off performance.now() minus a speech-start stamp, which
   * keeps running while the AudioContext is suspended. When a turn is frozen
   * mid-question (camera/mic disconnect) and later resumed, the voice picks up
   * exactly where it stopped but this wall clock has advanced by the whole
   * outage — leaving the mouth that far ahead of the audio. Shifting the
   * anchor by the outage duration re-aligns them.
   */
  shiftSpeechClock?(ms: number): void;
}

interface Props {
  avatarUrl: string;
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  /** Fired when the 3D avatar fails to initialise (WebGL error, GLB load
   *  failure, showAvatar timeout). Audio playback still works via the internal
   *  Web Audio fallback — this lets the parent swap in a static avatar image so
   *  the candidate sees a proper face instead of a blank canvas. */
  onFallback?: () => void;
  /** Low-power / audio-only mode (passed for low-tier devices). When true, the
   *  heavy 3D avatar is NEVER loaded or rendered (no GLB download, no Three.js
   *  scene, no render loop) — saving the CPU/GPU that overwhelms 2-core
   *  machines. Bina's voice still plays via the internal Web Audio fallback
   *  (headRef stays null → streamStart/streamAudio use fbPlayChunk). The parent
   *  shows the static Bina image. onReady + onFallback fire immediately. */
  audioOnly?: boolean;
}

/**
 * Download the avatar GLB ourselves, with retries, before handing it to
 * TalkingHead.
 *
 * On flaky networks/CDNs the model intermittently fails to download with
 * `net::ERR_QUIC_PROTOCOL_ERROR` (HTTP/3). After the first QUIC failure the
 * browser marks the origin as not-HTTP/3 and drops to HTTP/2, so a retry
 * almost always succeeds. We return a local `blob:` URL so TalkingHead's own
 * loader never re-hits the flaky transport. Throws if every attempt fails —
 * the caller then falls back to the original URL (current behaviour), so this
 * can only help, never regress.
 */
async function fetchAvatarWithRetry(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    } catch (e) {
      lastErr = e;
      console.warn(
        `[TalkingHead] avatar download attempt ${i + 1}/${attempts} failed (will retry over HTTP/2):`,
        e
      );
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Sanity ceiling on a measured audible-onset delay (ms). Anything larger is a
 *  stalled worklet / suspended context, not a real buffering delay — clamp it
 *  so one bad turn can't push the caption timeline wildly out. */
const MAX_MEASURED_DELAY_MS = 4000;

/** Hardware/output latency of an AudioContext in ms.
 *  `outputLatency` is the real speaker delay but is unimplemented on Safari;
 *  `baseLatency` (render-quantum buffering) is the portable approximation.
 *  Either way it's part of "arrival → audible" and belongs in the offset. */
function contextOutputLatencyMs(ctx: AudioContext | null | undefined): number {
  if (!ctx) return 0;
  const raw = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw * 1000 : 0;
}

export const TalkingHeadAvatar = forwardRef<TalkingHeadHandle, Props>(
  function TalkingHeadAvatar({ avatarUrl, className, style, onReady, onFallback, audioOnly }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const headRef      = useRef<any>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    const streamReadyRef      = useRef(false);
    const pendingRef          = useRef<ArrayBuffer[]>([]);
    const onAudioEndRef       = useRef<(() => void) | null>(null);
    // True when notifyEnd() was called before TalkingHead's streamStart resolved.
    // Deferred streamNotifyEnd fires after pending audio is flushed.
    const notifyEndPendingRef = useRef(false);

    // ── Fallback Web Audio API player (used when TalkingHead isn't ready) ──
    const fbCtxRef         = useRef<AudioContext | null>(null);
    const fbNextTimeRef    = useRef(0);
    const fbPendingRef     = useRef(0);     // scheduled-but-not-finished buffers
    const fbNoMoreDataRef  = useRef(false);
    const fbActiveRef      = useRef(false); // fallback mode is active this session
    // ── Measured audible onset (caption↔voice sync) ─────────────────────
    // InterviewUI paces its caption reveal against the audio clock, offset by
    // the delay between a PCM chunk ARRIVING and that audio actually becoming
    // audible (`window.__interviewAudibleDelayMs`, read via getAudibleDelayMs).
    // That used to be an unmeasured 1500 ms constant, which is the dominant
    // source of caption drift: the offset is applied to BOTH ends of the
    // reveal span, so every ms of error shifts the whole caption timeline.
    //
    // We now MEASURE it per turn instead of guessing. TalkingHead's playback
    // worklet posts `playback-started` the moment the first chunk is handed to
    // the audio thread, surfaced as the `onAudioStart` callback of
    // `head.streamStart(...)`. Delay = (onset − first-chunk arrival) + the
    // context's own output latency. On the very first turn this legitimately
    // includes the one-off AudioWorklet module load; from then on it settles to
    // a few ms + hardware latency.
    const firstChunkAtRef      = useRef<number | null>(null);  // performance.now() of turn's 1st chunk
    const onsetMeasuredRef     = useRef(false);                // onset already measured this turn
    // Last WORKLET-path measurement, carried forward as the next worklet turn's
    // prior. Fallback-path measurements are NOT stored here: the fallback is
    // near-instant, so inheriting its value would UNDER-estimate a worklet turn
    // and let captions outrun Bina — the one direction the reveal can't undo.
    const lastMeasuredDelayRef = useRef<number | null>(null);
    // Phoneme-based lip sync: visemes from text, scaled to actual audio duration
    const fullTextRef          = useRef("");
    const lastBuiltTextRef     = useRef("");
    const visemeTimelineRef    = useRef<{viseme: string, startMs: number, durMs: number}[]>([]);
    const timelineTotalMsRef   = useRef(0);          // total viseme timeline length
    const totalAudioMsRef      = useRef(0);           // actual PCM audio duration accumulated
    const speechStartRef       = useRef<number | null>(null);  // performance.now() when audio detected
    const currentMorphsRef     = useRef<Record<string, number>>({});
    const smoothAmpRef         = useRef(0);
    const ampDataRef           = useRef<Uint8Array | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      // ── Low-tier / audio-only mode ──────────────────────────────────────
      // Skip the ENTIRE 3D pipeline (GLB download, Three.js scene, render loop,
      // FPS watchdog) — that's what pegs 2-core machines at 100% CPU. headRef
      // stays null, so streamStart/streamAudio/notifyEnd automatically use the
      // internal Web Audio fallback (fbPlayChunk) → Bina's voice still plays.
      // Tell the parent to show the static Bina image (onFallback) and to
      // connect the WebSocket (onReady). No cleanup needed (nothing was created).
      if (audioOnly) {
        console.log("[TalkingHead] audio-only mode (low-tier) — 3D avatar NOT loaded; voice via Web Audio fallback");
        // "ready" renders just the dark studio background — NO loading spinner,
        // NO "Avatar Not Loaded" error message. The parent overlays the static
        // Bina image (onFallback → avatarFailed). onReady connects the WS.
        setStatus("ready");
        onFallback?.();
        onReady?.();
        return;
      }

      let mounted = true;
      let rafId: number | null = null;
      // Track head locally so cleanup can stop it even before headRef is set.
      // Without this, React StrictMode's double-invoke creates two TalkingHead
      // instances on the same canvas and the first one is never stopped.
      let localHead: any = null;

      (async () => {
        try {
          const { TalkingHead } = await import(
            /* webpackIgnore: true */ "/talkinghead/talkinghead.mjs"
          );
          if (!mounted) return;

          const head = new TalkingHead(containerRef.current!, {
            lipsyncModules: ["en"],
            cameraView: "upper",
            cameraDistance: -1.2,
            cameraY: -0.2,               // negative = camera moves UP to eye level
            cameraRotateEnable: false,
            cameraPanEnable: false,
            cameraZoomEnable: false,
            avatarMood: "happy",
            avatarIdleEyeContact: 1.0,
            avatarSpeakingEyeContact: 1.0,
            avatarIdleHeadMove: 0,
            avatarSpeakingHeadMove: 0,
            modelMovementFactor: 0,
            avatarIdleHandMove: 0,
            avatarSpeakingHandMove: 0,
            // Professional studio lighting — soft bright front light
            lightAmbientColor: 0xfff5eb,       // warm white ambient
            lightAmbientIntensity: 3,           // brighter ambient fill
            lightDirectColor: 0xffeedd,         // warm key light
            lightDirectIntensity: 40,           // strong front light for subject pop
            lightSpotIntensity: 0,              // no harsh spot
          });
          localHead = head; // register immediately so cleanup can stop it

          // ── Inject user-gesture AudioContext (24kHz) BEFORE showAvatar ──
          // TalkingHead creates a suspended AudioContext in its constructor.
          // By injecting the pre-created running context, showAvatar() and the
          // subsequent start() call use a context that is already running, avoiding
          // autoplay-policy hangs.
          // Node graph mirrors TalkingHead's initAudioGraph() exactly so that
          // streamStart / streamAudio / streamNotifyEnd all work correctly.
          try {
            const preCreated = (window as any).__interviewAudioContext as AudioContext | undefined;
            if (preCreated && preCreated.state !== "closed") {
              // Close TalkingHead's auto-created context (not needed anymore)
              if (head.audioCtx && head.audioCtx !== preCreated && head.audioCtx.state !== "closed") {
                try { head.audioCtx.close(); } catch {}
              }
              head.audioCtx = preCreated;
              // NOTE: keep __interviewAudioContext set so a StrictMode second mount
              // can also inject it (it will be resumed by showAvatar → start() anyway)

              // ── Replicate initAudioGraph node setup with correct connections ──
              head.audioSpeechSource       = preCreated.createBufferSource();
              head.audioBackgroundSource   = preCreated.createBufferSource();
              head.audioBackgroundGainNode = preCreated.createGain();
              head.audioSpeechGainNode     = preCreated.createGain();
              head.audioStreamGainNode     = preCreated.createGain();
              head.audioAnalyzerNode       = preCreated.createAnalyser();
              head.audioAnalyzerNode.fftSize = 256;
              head.audioAnalyzerNode.smoothingTimeConstant = 0.1;
              head.audioAnalyzerNode.minDecibels = -70;
              head.audioAnalyzerNode.maxDecibels = -10;
              // ConvolverNode (reverb) — used as dry pass-through
              head.audioReverbNode = preCreated.createConvolver();
              // Connections matching TalkingHead's initAudioGraph:
              //   analyser → speechGain → reverb → destination
              //   streamGain → reverb → destination
              //   backgroundGain → reverb → destination
              head.audioBackgroundGainNode.connect(head.audioReverbNode);
              head.audioAnalyzerNode.connect(head.audioSpeechGainNode);
              head.audioSpeechGainNode.connect(head.audioReverbNode);
              head.audioStreamGainNode.connect(head.audioReverbNode);
              head.audioReverbNode.connect(preCreated.destination);
              // Also route Bina's voice to the screen recording mix (if active)
              const recordingDest = (window as any).__interviewRecordingDest as AudioNode | null;
              if (recordingDest) {
                try { head.audioReverbNode.connect(recordingDest); } catch {}
              }
              // Dry impulse so reverb is a pass-through
              const impulse = preCreated.createBuffer(2, preCreated.sampleRate, preCreated.sampleRate);
              impulse.getChannelData(0)[0] = 1;
              impulse.getChannelData(1)[0] = 1;
              head.audioReverbNode.buffer = impulse;

              head.workletLoaded    = false;
              head.streamWorkletNode = null;
              console.log("[TalkingHead] Pre-injected 24kHz AudioContext with correct graph, state:", preCreated.state);
            }
          } catch (e) {
            console.warn("[TalkingHead] AudioContext pre-injection failed:", e);
          }

          // QUIC/HTTP3 resilience: pre-fetch the GLB ourselves (with retries
          // that fall back to HTTP/2 after a QUIC error) and pass TalkingHead a
          // local blob URL so its loader never re-hits the flaky transport.
          // Falls back to the original URL if every attempt fails, so this can
          // only help — worst case is the previous behaviour.
          let _avatarSrc = avatarUrl;
          try {
            _avatarSrc = await fetchAvatarWithRetry(avatarUrl);
          } catch (e) {
            console.warn("[TalkingHead] avatar pre-fetch failed — using direct URL:", e);
          }

          try {
            await Promise.race([
              head.showAvatar({ url: _avatarSrc, body: "F", lipsyncLang: "en" }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("showAvatar timeout after 20 s")), 20000)
              ),
            ]);
          } finally {
            // Free the blob once TalkingHead has parsed the model.
            if (_avatarSrc.startsWith("blob:")) {
              try { URL.revokeObjectURL(_avatarSrc); } catch {}
            }
          }

          if (!mounted) return;

          // ══════════════════════════════════════════════════════════
          // PROFESSIONAL INTERVIEWER BEHAVIOR
          // - Straight pose (hands relaxed at sides, no hip/crossed)
          // - Direct eye contact with camera
          // - Subtle natural micro head movements (not robotic)
          // - Natural blinking at realistic intervals
          // - Slight facial expressions while speaking
          // - No exaggerated hand gestures
          // - No side glancing / looking away
          // - Calm, confident, balanced appearance
          // ══════════════════════════════════════════════════════════

          try {
            // 1) Force straight pose (hands down, relaxed — NEVER hip)
            head.poseName = "straight";
            head.poseCurrentTemplate = head.poseTemplates["straight"];
            head.setPoseFromTemplate(head.poseTemplates["straight"], 0);

            // 2) Replace ALL pose animation alternatives with straight-only
            // (Don't touch poseBase/poseTarget/poseTemplates directly — causes clone errors)
            const straightOnly = { delay: [999999, 999999], vs: { pose: ["straight"] } };
            if (head.animPoses) {
              for (const key of Object.keys(head.animPoses)) {
                const tmpl = head.animPoses[key];
                if (tmpl?.alt) tmpl.alt = [straightOnly];
              }
            }

            // 3) Reduce body rotation to very subtle micro-movements (natural, not frozen)
            const subtleBody = {
              idle:     { delay: [2000, 8000], dt: [[3000, 8000]], vs: { bodyRotateX: [[-0.01, 0.02]], bodyRotateY: [[-0.02, 0.02]], bodyRotateZ: [[-0.01, 0.01]] } },
              speaking: { dt: [[1000, 3000, 0]], vs: { bodyRotateX: [[-0.01, 0.03]], bodyRotateY: [[-0.02, 0.02]], bodyRotateZ: [[-0.01, 0.01]] } },
            };
            if (head.poseTemplates) {
              for (const poseName of Object.keys(head.poseTemplates)) {
                const tmpl = head.poseTemplates[poseName];
                if (tmpl?.anims) {
                  for (const anim of tmpl.anims) {
                    if (anim?.name === "head") {
                      anim.idle = subtleBody.idle;
                      anim.speaking = subtleBody.speaking;
                    }
                  }
                }
              }
            }

            // 4) No hand gestures — permanently override with non-writable property
            try {
              Object.defineProperty(head, 'speakWithHands', {
                value: () => {},
                writable: false,
                configurable: false,
              });
            } catch {
              head.speakWithHands = () => {};
            }

            // 5) Disable emoji gestures
            head.animEmojis = {};

            // 6) Eye contact — always looking at camera, very minimal natural eye drift
            const lockEyeTemplate = (template: any) => {
              if (!template) return;
              for (const key of ["idle", "speaking"]) {
                const sub = template[key];
                if (!sub) continue;
                if (sub.vs) {
                  sub.vs.eyesRotateY = [[-0.01, 0.01]]; // tiny natural drift
                  sub.vs.eyesRotateX = [[-0.005, 0.005]];
                  sub.vs.headMove = [0];
                  sub.vs.eyeContact = [1];
                }
                if (sub.alt) {
                  for (const alt of sub.alt) {
                    if (alt.vs) {
                      alt.vs.eyesRotateY = [[-0.01, 0.01]];
                      alt.vs.eyesRotateX = [[-0.005, 0.005]];
                      alt.vs.headMove = [0];
                      alt.vs.eyeContact = [1];
                    }
                  }
                }
              }
            };
            lockEyeTemplate(head.animTemplateEyes);

            // 7) Movement factors — subtle, professional
            head.avatarIdleHeadMove = 0.02;     // very slight head sway
            head.avatarSpeakingHeadMove = 0.03;  // tiny nod while speaking
            head.modelMovementFactor = 0;
            head.avatarIdleHandMove = 0;
            head.avatarSpeakingHandMove = 0;
            head.avatarIdleEyeContact = 1.0;
            head.avatarSpeakingEyeContact = 1.0;

            console.log("[TalkingHead] Professional interviewer mode — natural, calm, direct eye contact");
          } catch (e) {
            console.warn("[TalkingHead] Behavior setup failed:", e);
          }

          // ── Find bones for per-frame enforcement ──
          let eyeBones: any[] = [];
          let headBone: any = null;
          let neckBone: any = null;
          try {
            const armature = head.armature || head.avatar;
            if (armature) {
              armature.traverse((bone: any) => {
                if (!bone.isBone) return;
                const n = (bone.name || "").toLowerCase();
                if (/eye/.test(n) && !/eyelash|eyelid|eyebrow/.test(n)) {
                  eyeBones.push(bone);
                }
                if (n === "head") headBone = bone;
                if (n === "neck") neckBone = bone;
              });
              console.log("[TalkingHead] Eye bones:", eyeBones.map((b: any) => b.name).join(", ") || "none");
              console.log("[TalkingHead] Head bone:", headBone?.name || "none", "Neck bone:", neckBone?.name || "none");
            }
          } catch {}

          const eyeLookMorphs = [
            "eyeLookUpLeft", "eyeLookUpRight",
            "eyeLookDownLeft", "eyeLookDownRight",
            "eyeLookInLeft", "eyeLookInRight",
            "eyeLookOutLeft", "eyeLookOutRight",
          ];

          headRef.current = head;
          setStatus("ready");
          onReady?.();

          // Debug
          try {
            const mt = head.mtAvatar;
            if (mt) {
              const visemeKeys = Object.keys(mt).filter(k => k.startsWith("viseme_"));
              console.log("[TalkingHead] Visemes:", visemeKeys.join(", "));
            }
          } catch {}

          // ── Per-frame: eye contact + behavior guard + amplitude lip sync ──
          const enforce = () => {
            if (!mounted || !headRef.current) return;
            const h = headRef.current;

            try {
              const mt = h.mtAvatar;

              // ── Direct eye contact — eyes forward, chin level ──
              h.avatarIdleEyeContact = 1.0;
              h.avatarSpeakingEyeContact = 1.0;
              if (h.eyeTarget) { h.eyeTarget.x = 0; h.eyeTarget.y = 0; }

              // Clamp eye bone rotations to near-zero
              for (const bone of eyeBones) {
                bone.rotation.x = Math.max(-0.01, Math.min(0.01, bone.rotation.x));
                bone.rotation.y = Math.max(-0.01, Math.min(0.01, bone.rotation.y));
              }

              // Clamp eye look morphs
              if (mt) {
                for (const m of eyeLookMorphs) {
                  if (mt[m] && mt[m].realtime != null) {
                    mt[m].realtime = Math.max(-0.02, Math.min(0.02, mt[m].realtime));
                    mt[m].needsUpdate = true;
                  }
                }
              }

              // ── Head level — chin up, never look down ──
              // Three.js: positive rotation.x on Head bone = tilt forward (look down)
              if (headBone) {
                headBone.rotation.x = Math.max(-0.03, Math.min(0.005, headBone.rotation.x));
                headBone.rotation.z = Math.max(-0.015, Math.min(0.015, headBone.rotation.z));
              }
              if (neckBone) {
                neckBone.rotation.x = Math.max(-0.02, Math.min(0.005, neckBone.rotation.x));
                neckBone.rotation.z = Math.max(-0.015, Math.min(0.015, neckBone.rotation.z));
              }
              // TalkingHead morph: positive headRotateX = look down. Clamp to ≤ 0.
              if (mt?.headRotateX) {
                mt.headRotateX.realtime = Math.min(0, mt.headRotateX.realtime ?? 0);
                mt.headRotateX.needsUpdate = true;
              }

              // ── Ensure pose stays straight (never hip) ──
              if (h.poseName !== "straight") {
                h.poseName = "straight";
                h.poseCurrentTemplate = h.poseTemplates["straight"];
              }

              // ══════════════════════════════════════════════════════════
              // PHONEME-BASED LIP SYNC — AUDIO-DURATION SYNCED
              //
              // 1. Viseme sequence from text via lipsync-en NRL phoneme rules
              // 2. Timeline dynamically scaled to ACTUAL audio duration (PCM ms)
              // 3. Audio analyser detects playback start/stop
              // 4. Lips stop IMMEDIATELY when audio ends — no trailing animation
              // 5. Subtle, controlled intensity — no exaggerated mouth opening
              // ══════════════════════════════════════════════════════════

              const SHAPES: Record<string, Record<string, number>> = {
                "sil": {},
                "PP":  { viseme_PP: 0.30 },
                "FF":  { viseme_FF: 0.22, jawOpen: 0.04 },
                "TH":  { viseme_TH: 0.18, jawOpen: 0.06 },
                "DD":  { viseme_DD: 0.20, jawOpen: 0.10 },
                "kk":  { viseme_kk: 0.18, jawOpen: 0.10 },
                "CH":  { viseme_CH: 0.20, jawOpen: 0.06 },
                "SS":  { viseme_SS: 0.22, jawOpen: 0.03 },
                "nn":  { viseme_nn: 0.18, jawOpen: 0.06 },
                "RR":  { viseme_RR: 0.20, jawOpen: 0.10 },
                "aa":  { viseme_aa: 0.28, jawOpen: 0.18 },
                "E":   { viseme_E:  0.24, jawOpen: 0.12 },
                "I":   { viseme_I:  0.20, jawOpen: 0.08 },
                "O":   { viseme_O:  0.26, jawOpen: 0.15 },
                "U":   { viseme_U:  0.22, jawOpen: 0.10 },
              };

              const ALL_MORPHS = [
                "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD", "viseme_kk",
                "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR", "viseme_aa",
                "viseme_E",  "viseme_I",  "viseme_O",  "viseme_U",  "jawOpen",
              ];

              // Rebuild viseme timeline when text changes
              const curText = fullTextRef.current;
              if (curText && curText !== lastBuiltTextRef.current) {
                const lm = h.lipsync?.["en"];
                if (lm) {
                  const MS_PER_UNIT = 70;
                  const WORD_GAP = 25;
                  const words = curText.split(/\s+/).filter((w: string) => w.length > 0);
                  const tl: {viseme: string, startMs: number, durMs: number}[] = [];
                  let cursor = 0;
                  for (const word of words) {
                    try {
                      const v = lm.wordsToVisemes(word);
                      if (v?.visemes?.length) {
                        for (let vi = 0; vi < v.visemes.length; vi++) {
                          const dur = (v.durations[vi] || 1) * MS_PER_UNIT;
                          tl.push({ viseme: v.visemes[vi], startMs: cursor, durMs: dur });
                          cursor += dur;
                        }
                      }
                    } catch {
                      tl.push({ viseme: "DD", startMs: cursor, durMs: 70 });
                      cursor += 70;
                    }
                    tl.push({ viseme: "sil", startMs: cursor, durMs: WORD_GAP });
                    cursor += WORD_GAP;
                  }
                  visemeTimelineRef.current = tl;
                  timelineTotalMsRef.current = cursor;
                  lastBuiltTextRef.current = curText;
                }
              }

              // Detect audio playback via speechStartRef (anchored to first PCM chunk).
              // We do NOT use the AnalyserNode for speaking detection because streaming
              // audio goes through audioStreamGainNode → reverb, bypassing audioAnalyzerNode.
              // speechStartRef.current is set in sendAudioChunk() and reset to null by
              // streamStart() / streamStop() when the session ends.
              if (mt) {
                const isSpeaking = speechStartRef.current !== null;

                if (isSpeaking) {
                  const elapsed = performance.now() - speechStartRef.current!;
                  const tl = visemeTimelineRef.current;
                  const tlTotal = timelineTotalMsRef.current;
                  const audioTotal = totalAudioMsRef.current;

                  let targetShape: Record<string, number> = {};

                  if (tl.length > 0 && tlTotal > 0 && audioTotal > 0) {
                    // Scale timeline to match actual audio duration
                    // scale > 1 means audio is slower than timeline estimate
                    const scale = audioTotal / tlTotal;
                    // Map real elapsed time back to timeline position
                    const timelinePos = elapsed / scale;

                    // Binary-style reverse search for current viseme
                    let found = false;
                    for (let ti = tl.length - 1; ti >= 0; ti--) {
                      if (timelinePos >= tl[ti].startMs && timelinePos < tl[ti].startMs + tl[ti].durMs) {
                        targetShape = SHAPES[tl[ti].viseme] || {};
                        found = true;
                        break;
                      }
                    }
                    if (!found) targetShape = {};
                  } else if (tl.length === 0) {
                    // No timeline yet — subtle fallback
                    targetShape = SHAPES["DD"];
                  }

                  // Instant articulation — no easing, direct viseme snap
                  for (const morph of ALL_MORPHS) {
                    const target = targetShape[morph] || 0;
                    currentMorphsRef.current[morph] = target;
                    if (mt[morph]) {
                      mt[morph].realtime = currentMorphsRef.current[morph];
                      mt[morph].needsUpdate = true;
                    }
                  }
                } else {
                  // Audio stopped — IMMEDIATELY zero all lip morphs (no decay)
                  speechStartRef.current = null;
                  for (const morph of ALL_MORPHS) {
                    if (currentMorphsRef.current[morph]) {
                      currentMorphsRef.current[morph] = 0;
                      if (mt[morph]) {
                        mt[morph].realtime = 0;
                        mt[morph].needsUpdate = true;
                      }
                    }
                  }
                }
              }
            } catch {}

            rafId = requestAnimationFrame(enforce);
          };

          rafId = requestAnimationFrame(enforce);
          console.log("[TalkingHead] Avatar ready — straight pose, eyes locked, native lip sync");

          // ── FPS watchdog (2026-05-26) ────────────────────────────────────
          // Single-core / low-power candidate machines can finish loading the
          // avatar but then stutter or trigger Chrome's "Page Unresponsive"
          // because the 60fps render loop (morph blends + skinning + lighting)
          // is too heavy. Sample frame intervals for the first ~2s after the
          // avatar reports ready; if the average FPS is below a viable
          // interactive threshold, trip onFallback() so the parent swaps in the
          // static-image fallback. Audio playback (the only thing the interview
          // strictly needs) continues unaffected through the same TalkingHead
          // instance. Universal safety net — never fires on a capable machine;
          // saves the interview on the worst ones.
          //
          // Hardened 2026-10 — it was demoting capable machines to the static
          // image permanently:
          //   • it measured in the first 2s after ready, exactly when the
          //     interview starts camera recording, face detection, VAD and the
          //     WebSocket — a transient dip, not the device's real speed;
          //   • Chrome PAUSES requestAnimationFrame for a hidden / minimised /
          //     fully covered window, so "0 samples in 2s" read as
          //     "catastrophically slow";
          //   • one bad window was enough.
          // Now: wait WARMUP_DELAY_MS before measuring, only measure while the
          // page is visible (a window interrupted by hiding is discarded and
          // retried once visible), and degrade only after SLOW_WINDOWS_TO_DEGRADE
          // slow windows IN A ROW. A genuinely weak device still fails every
          // window and still falls back.
          (() => {
            const WARMUP_DELAY_MS = 4000;      // let interview start-up settle
            const SAMPLE_MS = 2000;            // one measurement window
            const RETRY_GAP_MS = 3000;         // pause before re-measuring after a slow window
            const WARMUP_FRAMES = 5;           // drop the first few frames of a window
            const MIN_AVG_FPS = 20;            // below this the device is unviable for 3D
            const SLOW_WINDOWS_TO_DEGRADE = 2; // consecutive slow windows before degrading
            let slowWindows = 0;

            const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

            // Re-arm once the page is visible again (a hidden page pauses rAF).
            const whenVisible = (fn: () => void) => {
              if (isVisible()) { fn(); return; }
              const onVis = () => {
                if (!isVisible()) return;
                document.removeEventListener('visibilitychange', onVis);
                if (mounted) setTimeout(fn, 500);
              };
              document.addEventListener('visibilitychange', onVis);
            };

            const measure = () => {
              if (!mounted) return;
              const windowStart = performance.now();
              const frameIntervals: number[] = [];
              let lastTick = windowStart;
              let interrupted = false;
              const onHide = () => { if (!isVisible()) interrupted = true; };
              document.addEventListener('visibilitychange', onHide);

              const tick = () => {
                if (!mounted) { document.removeEventListener('visibilitychange', onHide); return; }
                const now = performance.now();
                frameIntervals.push(now - lastTick);
                lastTick = now;
                if (now - windowStart < SAMPLE_MS && !interrupted) {
                  requestAnimationFrame(tick);
                  return;
                }
                document.removeEventListener('visibilitychange', onHide);
                // Hidden part-way: the numbers mean nothing — measure again
                // once visible, without counting this window.
                if (interrupted || !isVisible()) {
                  console.log('[TalkingHead][FPS-watchdog] page hidden during sampling — will re-measure when visible');
                  whenVisible(measure);
                  return;
                }
                const samples = frameIntervals.slice(WARMUP_FRAMES);
                const avgFps = samples.length >= 2
                  ? 1000 / (samples.reduce((acc, x) => acc + x, 0) / samples.length)
                  : 0; // <2 frames in 2s while visible → genuinely slow
                const slow = avgFps < MIN_AVG_FPS;
                slowWindows = slow ? slowWindows + 1 : 0;
                console.log(
                  `[TalkingHead][FPS-watchdog] avg=${avgFps.toFixed(1)}fps samples=${samples.length} (threshold=${MIN_AVG_FPS}fps, slow ${slowWindows}/${SLOW_WINDOWS_TO_DEGRADE})`
                );
                if (!slow) return; // healthy — keep 3D
                if (slowWindows >= SLOW_WINDOWS_TO_DEGRADE) {
                  console.warn(
                    `[TalkingHead][FPS-watchdog] ${slowWindows} slow windows in a row — degrading to static fallback`
                  );
                  onFallback?.();
                  return;
                }
                // One slow window — could be a transient spike; check again.
                setTimeout(() => whenVisible(measure), RETRY_GAP_MS);
              };
              requestAnimationFrame(tick);
            };

            setTimeout(() => whenVisible(measure), WARMUP_DELAY_MS);
            // Every step checks `mounted`, so pending timers are no-ops after unmount.
          })();

        } catch (err) {
          console.error("[TalkingHead] Failed to load avatar:", err);
          if (mounted) {
            setStatus("error");
            // Tell the parent to swap in a static avatar image — the 3D head
            // failed but audio still plays via the Web Audio fallback.
            onFallback?.();
            // Still signal ready so the WebSocket connects even without the avatar
            onReady?.();
          }
        }
      })();

      return () => {
        mounted = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        // Stop via localHead (set immediately after construction) so we can
        // clean up even if showAvatar() is still in-flight and headRef isn't set yet.
        try { localHead?.stop?.(); } catch {}
        try { headRef.current?.stop?.(); } catch {}
        headRef.current = null;
        localHead = null;
      };
    }, [avatarUrl, audioOnly]);

    // ── Send audio + track cumulative PCM duration for lip sync scaling ──
    const sendAudioChunk = (pcmData: ArrayBuffer) => {
      const head = headRef.current;
      if (!head) return;
      // Int16 samples @ 24kHz → ms
      totalAudioMsRef.current += (pcmData.byteLength / 2 / 24000) * 1000;
      // Anchor lip sync timeline to first audio chunk arrival (not amplitude detection)
      if (speechStartRef.current === null) {
        speechStartRef.current = performance.now();
      }

      // The TalkingHead worklet passes Int16 samples through at the AudioContext's
      // native rate. Most browsers run at 48kHz even when 24kHz is requested.
      // If the context is NOT 24kHz we must resample before sending, otherwise
      // audio plays at 2x speed (48kHz output / 24kHz input = 2x).
      const ctxRate = (head.audioCtx as AudioContext | undefined)?.sampleRate ?? 24000;
      const TTS_RATE = 24000;
      if (ctxRate !== TTS_RATE && ctxRate > 0) {
        const ratio = ctxRate / TTS_RATE; // e.g. 2.0 for 48kHz context
        const src = new Int16Array(pcmData);
        const outLen = Math.round(src.length * ratio);
        const out = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const pos = i / ratio;
          const idx = Math.floor(pos);
          const frac = pos - idx;
          const a = src[idx] ?? 0;
          const b = src[Math.min(idx + 1, src.length - 1)] ?? 0;
          out[i] = Math.round(a + frac * (b - a));
        }
        head.streamAudio({ audio: out.buffer });
      } else {
        head.streamAudio({ audio: pcmData });
      }
    };

    // ── Fallback: play Int16 PCM via Web Audio API when TalkingHead isn't ready ──
    const fbPlayChunk = (pcmData: ArrayBuffer) => {
      const ctx = fbCtxRef.current;
      if (!ctx) return;
      // Decode Int16 @ 24kHz → Float32
      const samples = new Int16Array(pcmData);
      const buf = ctx.createBuffer(1, samples.length, 24000);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      // Also route to screen recording mix (if active)
      const recordingDest = (window as any).__interviewRecordingDest as AudioNode | null;
      if (recordingDest) { try { src.connect(recordingDest); } catch {} }
      // Gapless scheduling
      const now = ctx.currentTime;
      const startAt = Math.max(now, fbNextTimeRef.current);
      src.start(startAt);
      fbNextTimeRef.current = startAt + buf.duration;
      fbPendingRef.current++;
      src.onended = () => {
        fbPendingRef.current--;
        if (fbPendingRef.current <= 0 && fbNoMoreDataRef.current) {
          fbPendingRef.current = 0;
          fbNoMoreDataRef.current = false;
          fbActiveRef.current = false;
          console.log("[FallbackAudio] All audio played");
          onAudioEndRef.current?.();
        }
      };
    };

    useImperativeHandle(ref, () => ({

      streamStart(_sampleRate: number, onAudioEnd: () => void) {
        const head = headRef.current;
        onAudioEndRef.current = onAudioEnd;
        pendingRef.current = [];
        streamReadyRef.current = false;
        notifyEndPendingRef.current = false;
        smoothAmpRef.current = 0;
        speechStartRef.current = null;
        currentMorphsRef.current = {};
        totalAudioMsRef.current = 0;
        timelineTotalMsRef.current = 0;
        lastBuiltTextRef.current = "";
        fbNoMoreDataRef.current = false;
        fbPendingRef.current = 0;
        fbActiveRef.current = false;
        // New turn → re-arm the audible-onset measurement.
        firstChunkAtRef.current = null;
        onsetMeasuredRef.current = false;

        if (!head) {
          // ── Fallback: play audio directly via Web Audio API ──
          console.warn("[TalkingHead] head not ready — using Web Audio API fallback");
          fbActiveRef.current = true;
          // This path plays each chunk at max(now, nextTime) — audible essentially
          // IMMEDIATELY, with no worklet init and no pre-buffering. Tell InterviewUI
          // so its caption anchor doesn't wait out TALKING_HEAD_BUFFER_MS (which is
          // only real for the worklet path); otherwise the text trails the voice by
          // ~1 s for the whole turn. Set per turn, because `head` may become ready
          // later in the session and flip us back to the worklet path.
          // Provisional 0 in case the context setup below throws; it is refined
          // to the context's real output latency as soon as we have the context
          // (an immediately-scheduled buffer is still delayed by the hardware
          // buffer, and that IS part of arrival→audible).
          (window as any).__interviewAudibleDelayMs = 0;
          try {
            // Reuse or create fallback AudioContext
            const preCreated = (window as any).__interviewAudioContext as AudioContext | undefined;
            if (preCreated && preCreated.state !== "closed") {
              fbCtxRef.current = preCreated;
              (window as any).__interviewAudioContext = null;
            } else if (!fbCtxRef.current || fbCtxRef.current.state === "closed") {
              fbCtxRef.current = new AudioContext({ sampleRate: 24000 });
            }
            const ctx = fbCtxRef.current;
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            const fbDelay = contextOutputLatencyMs(ctx);
            onsetMeasuredRef.current = true;   // nothing further to measure on this path
            // NOTE: deliberately not written to lastMeasuredDelayRef — see its comment.
            (window as any).__interviewAudibleDelayMs = fbDelay;
            console.log(`[TalkingHead] audible delay (fallback path) = ${fbDelay.toFixed(0)}ms`);
          } catch {}
          fbNextTimeRef.current = 0;
          // Mark ready immediately — no worklet setup needed
          streamReadyRef.current = true;
          const queued = pendingRef.current.splice(0);
          for (const buf of queued) fbPlayChunk(buf);
          return;
        }

        // Worklet path — audio is audible only after the worklet is up and the
        // first chunk reaches the audio thread. Seed InterviewUI with the LAST
        // MEASURED delay (self-calibrating across devices) and let it fall back
        // to TALKING_HEAD_BUFFER_MS only until the very first measurement lands.
        // `onAudioStart` below overwrites this with THIS turn's real value,
        // typically within one 200 ms reveal tick — so an inherited prior can
        // only be briefly wrong, never wrong for the whole turn. Note the first
        // turn measures high (one-off AudioWorklet module load); erring high is
        // the safe direction — captions trail slightly rather than outrun Bina.
        (window as any).__interviewAudibleDelayMs = lastMeasuredDelayRef.current;

        // Pre-resume AudioContext if suspended BEFORE calling head.streamStart.
        // TalkingHead's streamStart has a 1-second resume timeout — if we don't
        // pre-resume it returns early WITHOUT setting up the worklet, so
        // streamNotifyEnd() is a no-op and onAudioEnd is never called (interview hangs).
        const preResumeCtx = async () => {
          const ctx = head.audioCtx as AudioContext | undefined;
          if (ctx && ctx.state !== "running") {
            try { await ctx.resume(); } catch { /* ignore */ }
          }
        };

        const lm = head.lipsync?.["en"];
        console.log("[TalkingHead] streamStart — phoneme-based lip sync, lipsync module:", lm ? "loaded" : "NOT loaded");

        preResumeCtx().then(() => {
          head
            .streamStart(
              {
                gain: 1,
                lipsyncLang: "en",
                waitForAudioChunks: 0,
              },
              // onAudioStart — the playback worklet has taken the first chunk,
              // i.e. Bina is (about to become) audible. This is the measurement
              // that replaces the old TALKING_HEAD_BUFFER_MS guess.
              () => {
                if (onsetMeasuredRef.current) return;
                const arrivedAt = firstChunkAtRef.current;
                if (arrivedAt === null) return;   // no chunk seen yet — nothing to measure against
                onsetMeasuredRef.current = true;
                const ctx = headRef.current?.audioCtx as AudioContext | undefined;
                const measured = Math.min(
                  MAX_MEASURED_DELAY_MS,
                  Math.max(0, performance.now() - arrivedAt) + contextOutputLatencyMs(ctx),
                );
                lastMeasuredDelayRef.current = measured;
                (window as any).__interviewAudibleDelayMs = measured;
                console.log(
                  `[TalkingHead] measured audible delay = ${measured.toFixed(0)}ms ` +
                  `(worklet path, outputLatency=${contextOutputLatencyMs(ctx).toFixed(0)}ms)`,
                );
              },
              () => {
                console.log("[TalkingHead] stream complete — audio finished");
                streamReadyRef.current = false;
                onAudioEndRef.current?.();
              },
            )
            .then(() => {
              if (!headRef.current) return;
              streamReadyRef.current = true;
              const queued = pendingRef.current.splice(0);
              console.log("[TalkingHead] streamStart ready, flushing", queued.length, "queued chunks");
              for (const buf of queued) {
                sendAudioChunk(buf);
              }
              // If notifyEnd() was called before we were ready (e.g. audio_end arrived
              // before TalkingHead's streamStart resolved), fire streamNotifyEnd now —
              // AFTER sending all pending audio so TalkingHead waits for it to play.
              if (notifyEndPendingRef.current) {
                notifyEndPendingRef.current = false;
                console.log("[TalkingHead] Deferred streamNotifyEnd — firing after pending flush");
                headRef.current?.streamNotifyEnd?.();
              }
            })
            .catch((e: Error) => {
              console.error("[TalkingHead] streamStart failed:", e);
              streamReadyRef.current = true;
              // Fire onAudioEnd so the mic starts even if TalkingHead failed
              onAudioEndRef.current?.();
            });
        });
      },

      streamAudio(pcmData: ArrayBuffer) {
        // Stamp the ARRIVAL of this turn's first chunk — the same instant
        // InterviewUI anchors its silent mirror-buffer timeline on. Measured
        // audible delay = onset − this. Stamped here (not in sendAudioChunk) so
        // chunks that get queued while the worklet is still loading still count
        // their true arrival time, which is what the mirror timeline uses.
        if (firstChunkAtRef.current === null) {
          firstChunkAtRef.current = performance.now();
        }
        if (fbActiveRef.current) {
          // Fallback mode: play directly
          if (!streamReadyRef.current) {
            pendingRef.current.push(pcmData);
          } else {
            fbPlayChunk(pcmData);
          }
          return;
        }
        if (!streamReadyRef.current) {
          pendingRef.current.push(pcmData);
          return;
        }
        sendAudioChunk(pcmData);
      },

      notifyEnd() {
        if (fbActiveRef.current) {
          fbNoMoreDataRef.current = true;
          // If all buffers already finished, fire immediately
          if (fbPendingRef.current <= 0) {
            fbNoMoreDataRef.current = false;
            fbActiveRef.current = false;
            onAudioEndRef.current?.();
          }
          return;
        }
        const head = headRef.current;
        if (head) {
          if (!streamReadyRef.current) {
            // TalkingHead's streamStart hasn't resolved yet — pending audio hasn't been
            // sent to TalkingHead. Deferring streamNotifyEnd until after the flush.
            console.log("[TalkingHead] notifyEnd deferred — stream not ready yet");
            notifyEndPendingRef.current = true;
          } else {
            head.streamNotifyEnd();
          }
        }
      },

      setText(text: string) {
        fullTextRef.current = text;
      },

      shiftSpeechClock(ms: number) {
        if (!(ms > 0)) return;
        // Only meaningful mid-speech; outside a turn the anchor is null and the
        // next streamStart stamps a fresh one anyway.
        if (speechStartRef.current !== null) {
          speechStartRef.current += ms;
          console.log(`[TalkingHead] speech clock shifted +${Math.round(ms)}ms (resumed after a paused turn)`);
        }
        // The onset measurement for this turn spans the outage, so it would
        // record a wildly inflated audible delay and skew the next turn's text
        // pacing. Drop it — lastMeasuredDelayRef keeps the previous good value.
        if (!onsetMeasuredRef.current) firstChunkAtRef.current = null;
      },

      streamStop() {
        console.log("[TalkingHead] streamStop called");
        streamReadyRef.current = false;
        pendingRef.current = [];
        // Turn is over — re-arm the onset measurement. `lastMeasuredDelayRef`
        // is deliberately NOT cleared: it is the next turn's prior.
        firstChunkAtRef.current = null;
        onsetMeasuredRef.current = false;
        speechStartRef.current = null;
        currentMorphsRef.current = {};
        totalAudioMsRef.current = 0;
        // Fallback mode: close context to stop playback immediately
        if (fbActiveRef.current) {
          fbActiveRef.current = false;
          fbNoMoreDataRef.current = false;
          fbPendingRef.current = 0;
          try { fbCtxRef.current?.close(); } catch {}
          fbCtxRef.current = null;
          return;
        }

        const h = headRef.current as any;
        if (h?.mtAvatar) {
          const VISEMES = [
            "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD", "viseme_kk",
            "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR", "viseme_aa",
            "viseme_E",  "viseme_I",  "viseme_O",  "viseme_U",  "jawOpen",
          ];
          for (const v of VISEMES) {
            const mt = h.mtAvatar[v];
            if (mt) { mt.realtime = null; mt.needsUpdate = true; }
          }
        }

        headRef.current?.streamStop?.();
      },

    }));

    return (
      <div
        className={`relative overflow-hidden ${className ?? ""}`}
        style={style}
      >
        {/* Dark cinematic studio background — soft navy with vignette (matches the interview page) */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, #1e2a4a 0%, #111a33 45%, #0a1020 100%)",
          }}
        />
        {/* Subtle studio light spill from top — enhances subject separation */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 15%, rgba(180,200,255,0.08) 0%, transparent 50%)",
          }}
        />
        <div ref={containerRef} className="w-full h-full relative z-10" />

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a1020]/80 backdrop-blur-sm">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-3" />
              <p className="text-xs text-gray-400">Loading avatar...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a1020]">
            <div className="text-center p-6 select-none">
              <div className="text-5xl mb-3">👤</div>
              <p className="text-sm font-medium text-gray-300 mb-1">Avatar Not Loaded</p>
              <p className="text-xs text-gray-500">Model must be from Ready Player Me or Avaturn</p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
