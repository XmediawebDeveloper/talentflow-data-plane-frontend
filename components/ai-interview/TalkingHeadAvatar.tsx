"use client";

/**
 * TalkingHeadAvatar — wrapper around the TalkingHead library.
 *
 * Audio playback is handled by InterviewUI via its own Web Audio API context.
 * This component handles the 3D avatar rendering and lip-sync animation only.
 *
 * Lip-sync strategy (real-time amplitude driven):
 *  1. InterviewUI taps the playing audio through a Web Audio AnalyserNode.
 *  2. Each animation frame it reads RMS amplitude → maps to an Oculus viseme.
 *  3. It calls applyVisemeLive(visemeName, amplitude) on this handle.
 *  4. applyVisemeLive pushes an animQueue entry stamped at head.animClock
 *     (current time), so TalkingHead's own render loop picks it up immediately.
 *     No AudioWorklet dependency, no timing calculations needed.
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
  /**
   * Apply a viseme to the avatar RIGHT NOW, driven by real-time amplitude.
   * Call this every animation frame while AI audio is playing.
   *
   * @param visemeName  Oculus viseme blend shape name (e.g. "viseme_aa")
   * @param amplitude   Normalised amplitude 0.0–1.0
   */
  applyVisemeLive(visemeName: string, amplitude: number): void;
}

interface Props {
  avatarUrl: string;
  className?: string;
  style?: React.CSSProperties;
}

export const TalkingHeadAvatar = forwardRef<TalkingHeadHandle, Props>(
  function TalkingHeadAvatar({ avatarUrl, className, style }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const headRef      = useRef<any>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    const streamReadyRef = useRef(false);
    const pendingRef     = useRef<ArrayBuffer[]>([]);
    const onAudioEndRef  = useRef<(() => void) | null>(null);

    // ── Load TalkingHead avatar ──────────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;
      let mounted = true;

      (async () => {
        try {
          const { TalkingHead } = await import(
            /* webpackIgnore: true */ "/talkinghead/talkinghead.mjs"
          );
          if (!mounted) return;

          const head = new TalkingHead(containerRef.current!, {
            lipsyncModules: ["en"],
          });

          await head.showAvatar({
            url: avatarUrl,
            body: "F",
            lipsyncLang: "en",
          });

          if (!mounted) return;
          headRef.current = head;
          setStatus("ready");
          console.log("[TalkingHead] Avatar ready");
        } catch (err) {
          console.error("[TalkingHead] Failed to load avatar:", err);
          if (mounted) setStatus("error");
        }
      })();

      return () => {
        mounted = false;
        try { headRef.current?.stop?.(); } catch {}
        headRef.current = null;
      };
    }, [avatarUrl]);

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({

      streamStart(_sampleRate: number, onAudioEnd: () => void) {
        const head = headRef.current;
        if (!head) return;

        streamReadyRef.current = false;
        pendingRef.current = [];
        onAudioEndRef.current = onAudioEnd;

        head
          .streamStart(
            {
              gain: 0,              // Muted — InterviewUI handles real audio
              lipsyncLang: "en",
              lipsyncType: "visemes",
              waitForAudioChunks: 0,
            },
            null,
            () => { streamReadyRef.current = false; },
          )
          .then(() => {
            if (!headRef.current) return;
            streamReadyRef.current = true;
            const queued = pendingRef.current.splice(0);
            for (const buf of queued) {
              head.streamAudio({ audio: buf });
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
        headRef.current?.streamAudio({ audio: pcmData });
      },

      streamStop() {
        streamReadyRef.current = false;
        pendingRef.current = [];

        // Release realtime control of all visemes so TalkingHead's own
        // animation system can animate the mouth back to idle/baseline.
        const h = headRef.current as any;
        if (h?.mtAvatar) {
          const VISEMES = [
            "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD", "viseme_kk",
            "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR", "viseme_aa",
            "viseme_E",  "viseme_I",  "viseme_O",  "viseme_U",
          ];
          for (const v of VISEMES) {
            const mt = h.mtAvatar[v];
            if (mt) { mt.realtime = null; mt.needsUpdate = true; }
          }
        }

        headRef.current?.streamStop?.();
      },

      applyVisemeLive(visemeName: string, amplitude: number) {
        const h = headRef.current as any;
        if (!h?.mtAvatar) return;

        // Use TalkingHead's `realtime` morph target property.
        // Unlike `system` (velocity-based, too slow) or animQueue entries,
        // `realtime` is applied DIRECTLY each frame with no easing delay —
        // exactly what we need for per-frame amplitude-driven lip sync.
        //
        // Strategy: every call sets the active viseme to `amplitude` and all
        // other Oculus visemes to 0 (instant reset, no crossfade lag).
        const VISEMES = [
          "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD", "viseme_kk",
          "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR", "viseme_aa",
          "viseme_E",  "viseme_I",  "viseme_O",  "viseme_U",
        ] as const;

        const target = Math.min(amplitude, 0.95);

        for (const v of VISEMES) {
          const mt = h.mtAvatar[v];
          if (!mt) continue;
          const val = (v === visemeName) ? target : 0;
          if (mt.realtime !== val) {
            mt.realtime    = val;
            mt.needsUpdate = true;
          }
        }
      },

    }));

    // ── Render ───────────────────────────────────────────────────────────────
    return (
      <div className={`relative overflow-hidden ${className ?? ""}`} style={style}>
        <div ref={containerRef} className="w-full h-full" />

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
              <p className="text-xs text-gray-500 mb-1">
                Place a GLB avatar at <code className="text-violet-400">/public/avatar.glb</code>
              </p>
              <p className="text-xs text-gray-600">
                Get one free from{" "}
                <span className="text-violet-400">avaturn.me</span>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
