"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

export type AvatarState =
  | "idle" | "listening" | "thinking" | "speaking"
  | "hand_raised" | "waving" | "nodding";

interface AvatarProps {
  state: AvatarState;
  isAiSpeaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
  mouthOpenness?: number;
}

const PRELOAD_BEFORE = 0.4; // seconds before end to pre-start next slot

export function Avatar({ state, isAiSpeaking, className = "", style }: AvatarProps) {
  const idleRef   = useRef<HTMLVideoElement>(null);
  const slotARef  = useRef<HTMLVideoElement>(null);
  const slotBRef  = useRef<HTMLVideoElement>(null);
  const activeRef = useRef<"a" | "b">("a");
  const [active, setActive] = useState<"a" | "b">("a");
  const isSpeakingRef = useRef(false);

  const isSpeaking = isAiSpeaking !== undefined ? isAiSpeaking : state === "speaking";
  isSpeakingRef.current = isSpeaking;

  // Idle always loops
  useEffect(() => {
    idleRef.current?.play().catch(() => {});
  }, []);

  // Pre-start inactive slot before active ends
  const onTimeUpdate = useCallback(() => {
    if (!isSpeakingRef.current) return;
    const cur  = activeRef.current === "a" ? slotARef.current : slotBRef.current;
    const next = activeRef.current === "a" ? slotBRef.current : slotARef.current;
    if (!cur || !next || !cur.duration) return;
    if (cur.duration - cur.currentTime <= PRELOAD_BEFORE && next.paused) {
      next.currentTime = 0;
      next.play().catch(() => {});
    }
  }, []);

  // Active slot ended → instantly flip to pre-loaded slot (no crossfade = no filter effect)
  const onEnded = useCallback(() => {
    if (!isSpeakingRef.current) return;
    const next = activeRef.current === "a" ? "b" : "a";
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    const a = slotARef.current;
    const b = slotBRef.current;
    if (!a || !b) return;
    a.addEventListener("timeupdate", onTimeUpdate);
    b.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("ended", onEnded);
    b.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      b.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("ended", onEnded);
      b.removeEventListener("ended", onEnded);
    };
  }, [onTimeUpdate, onEnded]);

  // Speaking start / stop
  useEffect(() => {
    const a = slotARef.current;
    const b = slotBRef.current;
    if (!a || !b) return;
    if (isSpeaking) {
      b.pause(); b.currentTime = 0;
      a.currentTime = 0;
      activeRef.current = "a";
      setActive("a");
      a.play().catch(() => {});
    } else {
      a.pause(); a.currentTime = 0;
      b.pause(); b.currentTime = 0;
    }
  }, [isSpeaking]);

  const fill: React.CSSProperties = {
    position: "absolute", top: 0, left: 0,
    width: "100%", height: "100%",
    objectFit: "cover", objectPosition: "top center",
    display: "block",
  };

  return (
    <div className={`overflow-hidden ${className}`} style={style}>

      {/* Idle — always underneath */}
      <video ref={idleRef} src="/linda-idle.mp4"
        autoPlay loop muted playsInline preload="auto"
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
      />

      {/* Speaking wrapper — fades in/out smoothly over idle.
          Inside: two slots swap INSTANTLY (no transition) = no filter blend. */}
      <div style={{
        ...fill,
        opacity: isSpeaking ? 1 : 0,
        transition: isSpeaking ? "opacity 0.2s ease-in" : "opacity 0.4s ease-out",
      }}>
        <video ref={slotARef} src="/linda.mp4" muted playsInline preload="auto"
          style={{ ...fill, opacity: active === "a" ? 1 : 0 }}
        />
        <video ref={slotBRef} src="/linda.mp4" muted playsInline preload="auto"
          style={{ ...fill, opacity: active === "b" ? 1 : 0 }}
        />
      </div>

      {isSpeaking && (
        <div style={{ ...fill, pointerEvents: "none",
          boxShadow: "inset 0 0 60px rgba(34,197,94,0.08)",
          animation: "pulse 1.8s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}
