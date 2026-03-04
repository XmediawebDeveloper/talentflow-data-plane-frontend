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

export interface TalkingHeadHandle {
  streamStart(sampleRate: number, onAudioEnd: () => void): void;
  streamAudio(pcmData: ArrayBuffer): void;
  streamStop(): void;
  /** Feed accumulated text so word-level visemes can be generated from audio timing */
  setText(text: string): void;
}

interface Props {
  avatarUrl: string;
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
}

export const TalkingHeadAvatar = forwardRef<TalkingHeadHandle, Props>(
  function TalkingHeadAvatar({ avatarUrl, className, style, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const headRef      = useRef<any>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    const streamReadyRef = useRef(false);
    const pendingRef     = useRef<ArrayBuffer[]>([]);
    const onAudioEndRef  = useRef<(() => void) | null>(null);
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
      let mounted = true;
      let rafId: number | null = null;

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

          await head.showAvatar({
            url: avatarUrl,
            body: "F",
            lipsyncLang: "en",
          });

          if (!mounted) return;

          // ── Inject user-gesture AudioContext (24kHz) so browser doesn't block audio ──
          // Must happen AFTER showAvatar so TalkingHead's own init is complete.
          try {
            const preCreated = (window as any).__interviewAudioContext as AudioContext | undefined;
            if (preCreated && preCreated.state !== "closed") {
              // Close TalkingHead's auto-created (suspended) AudioContext
              if (head.audioCtx && head.audioCtx !== preCreated) {
                try { head.audioCtx.close(); } catch {}
              }
              head.audioCtx = preCreated;
              (window as any).__interviewAudioContext = null;
              // Rebuild audio graph nodes on the 24kHz context
              head.audioSpeechSource = preCreated.createBufferSource();
              head.audioBackgroundSource = preCreated.createBufferSource();
              head.audioBackgroundGainNode = preCreated.createGain();
              head.audioSpeechGainNode = preCreated.createGain();
              head.audioStreamGainNode = preCreated.createGain();
              head.audioAnalyzerNode = preCreated.createAnalyser();
              head.audioAnalyzerNode.fftSize = 256;
              head.audioAnalyzerNode.smoothingTimeConstant = 0.1;
              // Re-wire: stream gain → analyzer → speech gain → destination
              head.audioStreamGainNode.connect(head.audioAnalyzerNode);
              head.audioAnalyzerNode.connect(head.audioSpeechGainNode);
              head.audioSpeechGainNode.connect(preCreated.destination);
              head.audioBackgroundGainNode.connect(preCreated.destination);
              // Force worklet rebuild on next streamStart
              head.workletLoaded = false;
              head.streamWorkletNode = null;
              console.log("[TalkingHead] Injected 24kHz AudioContext, state:", preCreated.state, "sampleRate:", preCreated.sampleRate);
            }
          } catch (e) {
            console.warn("[TalkingHead] AudioContext injection failed:", e);
          }

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

              // Detect audio playback via analyser
              const analyser = h.audioAnalyzerNode;
              if (analyser && mt) {
                if (!ampDataRef.current || ampDataRef.current.length !== analyser.frequencyBinCount) {
                  ampDataRef.current = new Uint8Array(analyser.frequencyBinCount);
                }
                analyser.getByteFrequencyData(ampDataRef.current);
                const data = ampDataRef.current;
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const rawAmp = sum / (data.length * 255);
                // Instant detection — no smoothing delay
                smoothAmpRef.current = rawAmp;
                const isSpeaking = rawAmp > 0.005;

                if (isSpeaking) {
                  // Mark exact moment audio playback begins
                  if (speechStartRef.current === null) {
                    speechStartRef.current = performance.now();
                  }

                  const elapsed = performance.now() - speechStartRef.current;
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

        } catch (err) {
          console.error("[TalkingHead] Failed to load avatar:", err);
          if (mounted) setStatus("error");
        }
      })();

      return () => {
        mounted = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        try { headRef.current?.stop?.(); } catch {}
        headRef.current = null;
      };
    }, [avatarUrl]);

    // ── Send audio + track cumulative PCM duration for lip sync scaling ──
    const sendAudioChunk = (pcmData: ArrayBuffer) => {
      const head = headRef.current;
      if (!head) return;
      // Int16 samples @ 24kHz → ms
      totalAudioMsRef.current += (pcmData.byteLength / 2 / 24000) * 1000;
      head.streamAudio({ audio: pcmData });
    };

    useImperativeHandle(ref, () => ({

      streamStart(_sampleRate: number, onAudioEnd: () => void) {
        const head = headRef.current;
        if (!head) {
          console.warn("[TalkingHead] streamStart called but head not ready");
          return;
        }

        streamReadyRef.current = false;
        pendingRef.current = [];
        onAudioEndRef.current = onAudioEnd;
        smoothAmpRef.current = 0;
        speechStartRef.current = null;
        currentMorphsRef.current = {};
        totalAudioMsRef.current = 0;
        timelineTotalMsRef.current = 0;
        // Rebuild viseme timeline from current text
        lastBuiltTextRef.current = "";

        // Resume AudioContext if suspended
        try {
          if (head.audioCtx?.state === "suspended") {
            head.audioCtx.resume();
          }
        } catch {}

        const lm = head.lipsync?.["en"];
        console.log("[TalkingHead] streamStart — phoneme-based lip sync, lipsync module:", lm ? "loaded" : "NOT loaded");

        head
          .streamStart(
            {
              gain: 1,
              lipsyncLang: "en",
              waitForAudioChunks: 0,
            },
            null,
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
          })
          .catch((e: Error) => {
            console.error("[TalkingHead] streamStart failed:", e);
            streamReadyRef.current = true;
          });
      },

      streamAudio(pcmData: ArrayBuffer) {
        if (!streamReadyRef.current) {
          pendingRef.current.push(pcmData);
          return;
        }
        sendAudioChunk(pcmData);
      },

      setText(text: string) {
        fullTextRef.current = text;
      },

      streamStop() {
        console.log("[TalkingHead] streamStop called");
        streamReadyRef.current = false;
        pendingRef.current = [];
        speechStartRef.current = null;
        currentMorphsRef.current = {};
        totalAudioMsRef.current = 0;

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
        {/* Dark cinematic studio background — soft charcoal with vignette */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, #3a3a3f 0%, #2a2a2e 40%, #1a1a1e 75%, #0f0f12 100%)",
          }}
        />
        {/* Subtle studio light spill from top — enhances subject separation */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 15%, rgba(200,195,185,0.08) 0%, transparent 50%)",
          }}
        />
        <div ref={containerRef} className="w-full h-full relative z-10" />

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-gray-400">Loading avatar...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
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
