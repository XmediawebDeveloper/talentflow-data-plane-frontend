"use client";

import { useEffect, useState, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Avatar } from "./Avatar";
import type { AvatarState } from "@/hooks/useAvatarState";
import Avatar3DScene from "./avatar3d/Avatar3DScene";

interface Avatar3DProps {
  state: AvatarState;
  className?: string;
  mouthOpenness?: number;
}

// ---------- Error Boundary ----------
class Avatar3DErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[Avatar3D] WebGL error, falling back to 2D:", error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ---------- WebGL detection (runs once) ----------
let _webglResult: boolean | null = null;
function detectWebGL(): boolean {
  if (_webglResult !== null) return _webglResult;
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    _webglResult = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    _webglResult = false;
  }
  return _webglResult!;
}

// ---------- Status badge ----------
function StatusBadge({ state }: { state: AvatarState }) {
  const color: Record<AvatarState, string> = {
    speaking: "#22c55e", thinking: "#eab308", listening: "#3b82f6",
    waving: "#ec4899", hand_raised: "#f97316", nodding: "#8b5cf6", idle: "#6b7280",
  };
  const text: Record<AvatarState, string> = {
    speaking: "Speaking", thinking: "Thinking", listening: "Listening",
    waving: "Waving", hand_raised: "Hand Raised", nodding: "Nodding", idle: "Ready",
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
      <div className="px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg">
        <span className="text-sm font-semibold text-white">Linda</span>
      </div>
      <div
        className="px-3 py-1.5 rounded-lg backdrop-blur-sm flex items-center gap-2"
        style={{ backgroundColor: `${color[state]}dd` }}
      >
        <span className={`w-2 h-2 rounded-full bg-white ${state !== "idle" ? "animate-pulse" : ""}`} />
        <span className="text-xs font-medium text-white">{text[state]}</span>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
export function Avatar3D({
  state,
  className = "",
  mouthOpenness = 0,
}: Avatar3DProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglSupported(detectWebGL());
  }, []);

  if (webglSupported === null) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-full rounded-3xl overflow-hidden bg-gray-800 flex items-center justify-center">
          <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!webglSupported) {
    return <Avatar state={state} className={className} mouthOpenness={mouthOpenness} />;
  }

  const fallback2D = (
    <Avatar state={state} className={className} mouthOpenness={mouthOpenness} />
  );

  return (
    <div className={`relative ${className}`}>
      <Avatar3DErrorBoundary fallback={fallback2D}>
        <div
          className="relative w-full h-full rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
          }}
        >
          <Canvas
            camera={{ fov: 35 }}
            gl={{ antialias: true, alpha: true }}
            style={{ width: "100%", height: "100%" }}
          >
            <Avatar3DScene />
          </Canvas>
          <StatusBadge state={state} />
        </div>
      </Avatar3DErrorBoundary>
    </div>
  );
}
