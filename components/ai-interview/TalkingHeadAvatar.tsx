"use client";

/**
 * TalkingHeadAvatar — wrapper around the TalkingHead library.
 *
 * Audio playback is handled externally (Web Audio API in InterviewUI).
 * This component receives the SAME PCM Int16 chunks and uses them
 * for visual lip-sync animation only (gain: 0 → silent internally).
 *
 * Avatar GLB requirements:
 *  - Mixamo-compatible rig (root bone named "Armature")
 *  - Oculus Viseme blend shapes (15 shapes) for lip sync
 *  - ARKit blend shapes (52 shapes) for expressions (optional but better)
 *
 * Get a compatible avatar from: avaturn.me (free, non-commercial)
 * Export as GLB → place at /public/avatar.glb
 */

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";

// ── Public handle — used by InterviewUI to drive animation ───────────────────
export interface TalkingHeadHandle {
  /** Call before feeding audio chunks. sampleRate must match PCM stream (24000). */
  streamStart(sampleRate: number, onAudioEnd: () => void): void;
  /** Feed a raw Int16 PCM ArrayBuffer chunk. */
  streamAudio(pcmData: ArrayBuffer): void;
  /** Signal end of audio stream — avatar transitions back to idle. */
  streamStop(): void;
}

interface Props {
  /** Path to avatar GLB, e.g. "/avatar.glb" */
  avatarUrl: string;
  className?: string;
  style?: React.CSSProperties;
}

export const TalkingHeadAvatar = forwardRef<TalkingHeadHandle, Props>(
  function TalkingHeadAvatar({ avatarUrl, className, style }, ref) {
    const containerRef   = useRef<HTMLDivElement>(null);
    const headRef        = useRef<any>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    // Stream state — managed inside the component so the handle stays stable
    const streamReadyRef  = useRef(false);
    const pendingRef      = useRef<ArrayBuffer[]>([]);
    const onAudioEndRef   = useRef<(() => void) | null>(null);

    // ── Load TalkingHead avatar ──────────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;
      let mounted = true;

      (async () => {
        try {
          // Load from /public/talkinghead/ so import.meta.url resolves correctly
          // (webpack bundles break TalkingHead's dynamic lipsync module loading)
          const { TalkingHead } = await import(
            /* webpackIgnore: true */ "/talkinghead/talkinghead.mjs"
          );
          if (!mounted) return;

          const head = new TalkingHead(containerRef.current!, {
            lipsyncModules: ["en"],
            // ttsEndpoint intentionally omitted — we stream our own audio
          });

          await head.showAvatar({
            url: avatarUrl,
            body: "F",        // Female avatar
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
      streamStart(sampleRate: number, onAudioEnd: () => void) {
        const head = headRef.current;
        if (!head) return;

        // Reset buffer for this new speaking turn
        streamReadyRef.current = false;
        pendingRef.current = [];
        onAudioEndRef.current = onAudioEnd;

        head
          .streamStart(
            {
              sampleRate,
              gain: 0,           // Mute TalkingHead — Web Audio API handles playback
              lipsyncLang: "en",
              waitForAudioChunks: 2, // Buffer 2 chunks before starting animation
            },
            null,                // onAudioStart callback
            () => {              // onAudioEnd callback
              streamReadyRef.current = false;
              // NOTE: We do NOT call onAudioEndRef here — Web Audio API fires
              // handleAllAudioFinished independently. The TalkingHead callback
              // is just for avatar animation cleanup.
            },
          )
          .then(() => {
            if (!headRef.current) return;
            streamReadyRef.current = true;
            // Flush chunks that arrived before streamStart resolved
            const queued = pendingRef.current.splice(0);
            for (const chunk of queued) {
              head.streamAudio({ audio: chunk });
            }
          })
          .catch((e: Error) => {
            console.error("[TalkingHead] streamStart failed:", e);
          });
      },

      streamAudio(pcmData: ArrayBuffer) {
        if (!streamReadyRef.current) {
          // Buffer until streamStart resolves
          pendingRef.current.push(pcmData);
          return;
        }
        headRef.current?.streamAudio({ audio: pcmData });
      },

      streamStop() {
        streamReadyRef.current = false;
        headRef.current?.streamStop?.();
      },
    }));

    // ── Render ───────────────────────────────────────────────────────────────
    return (
      <div className={`relative overflow-hidden ${className ?? ""}`} style={style}>

        {/* TalkingHead mounts its own Three.js canvas here */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-gray-400">Loading avatar...</p>
            </div>
          </div>
        )}

        {/* Error / missing GLB overlay */}
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
