"use client";

/**
 * Avatar3D — React Three Fiber avatar with audio-driven mouth animation.
 *
 * Works in two modes:
 *  1. Built-in procedural head (no file needed — works immediately)
 *  2. GLB avatar from /public/avatar.glb (Ready Player Me) with real morph targets
 *
 * mouthOpenness (0–1 RMS amplitude) drives the mouth open/close.
 */

import React, {
  useRef,
  useEffect,
  Suspense,
  Component,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export interface Avatar3DProps {
  isAiSpeaking: boolean;
  mouthOpenness: number;
  className?: string;
  style?: React.CSSProperties;
}

// ── Error boundary ─────────────────────────────────────────────────────────────
interface EBState { hasError: boolean }
class AvatarErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  EBState
> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  componentDidCatch(e: Error) { console.warn("[Avatar3D] GLB error:", e.message); }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROCEDURAL HEAD — works with zero external files
// ══════════════════════════════════════════════════════════════════════════════
function ProceduralHead({
  isAiSpeaking,
  mouthOpenness,
}: {
  isAiSpeaking: boolean;
  mouthOpenness: number;
}) {
  const lowerLipRef  = useRef<THREE.Mesh>(null);
  const interiorRef  = useRef<THREE.Mesh>(null);
  const smooth       = useRef(0);

  useFrame((_, delta) => {
    const target = isAiSpeaking ? mouthOpenness : 0;
    smooth.current = THREE.MathUtils.lerp(smooth.current, target, Math.min(1, delta * 14));
    const v = smooth.current;

    if (lowerLipRef.current) {
      lowerLipRef.current.position.y = -0.188 - v * 0.055;
    }
    if (interiorRef.current) {
      // scaleY grows when mouth opens
      (interiorRef.current.scale as THREE.Vector3).y = 0.012 + v * 0.038;
    }
  });

  const skin     = "var(--raw-e8ad7c)";
  const skinDark = "var(--raw-c98d5a)";
  const hair     = "var(--raw-1c0e06)";
  const lipCol   = "var(--raw-b84444)";
  const eyeCol   = "var(--raw-2a1508)";
  const cloth    = "var(--raw-1e2535)";

  return (
    <group>
      {/* ── Hair (back + top) ─────────────────────────── */}
      <mesh position={[0, 0.12, -0.08]} scale={[1.12, 1.28, 1.08]}>
        <sphereGeometry args={[0.52, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.7]} />
        <meshStandardMaterial color={hair} roughness={0.9} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.38, -0.04]} scale={[1.04, 0.38, 1.04]}>
        <sphereGeometry args={[0.52, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>

      {/* ── Head ──────────────────────────────────────── */}
      <mesh>
        <sphereGeometry args={[0.5, 64, 64]} />
        <meshStandardMaterial color={skin} roughness={0.72} metalness={0.02} />
      </mesh>

      {/* Forehead soft highlight */}
      <mesh position={[0, 0.18, 0.46]} rotation={[0.3, 0, 0]}>
        <circleGeometry args={[0.16, 32]} />
        <meshStandardMaterial color="var(--raw-fce0c0)" transparent opacity={0.22} />
      </mesh>

      {/* ── Ears ─────────────────────────────────────── */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.505, 0.04, 0]} scale={[0.5, 0.72, 0.5]}>
          <sphereGeometry args={[0.115, 16, 16]} />
          <meshStandardMaterial color={skinDark} roughness={0.85} />
        </mesh>
      ))}

      {/* ── Eyebrows ──────────────────────────────────── */}
      {([-0.163, 0.163] as const).map((x, i) => (
        <mesh key={i} position={[x, 0.225, 0.46]} rotation={[0.08, 0, i === 0 ? 0.2 : -0.2]}>
          <boxGeometry args={[0.09, 0.013, 0.005]} />
          <meshStandardMaterial color="var(--raw-4a2808)" roughness={0.8} />
        </mesh>
      ))}

      {/* ── Eyes ─────────────────────────────────────── */}
      {([-0.163, 0.163] as const).map((x, i) => (
        <group key={i} position={[x, 0.1, 0.47]}>
          {/* White */}
          <mesh>
            <circleGeometry args={[0.073, 32]} />
            <meshStandardMaterial color="white" roughness={0.25} />
          </mesh>
          {/* Iris */}
          <mesh position={[0, 0, 0.001]}>
            <circleGeometry args={[0.043, 32]} />
            <meshStandardMaterial color={eyeCol} />
          </mesh>
          {/* Pupil */}
          <mesh position={[0, 0, 0.002]}>
            <circleGeometry args={[0.025, 16]} />
            <meshStandardMaterial color="var(--raw-050505)" />
          </mesh>
          {/* Specular highlight */}
          <mesh position={[0.015, 0.015, 0.003]}>
            <circleGeometry args={[0.009, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}

      {/* ── Nose ─────────────────────────────────────── */}
      <mesh position={[0, -0.02, 0.5]}>
        <sphereGeometry args={[0.037, 16, 16]} />
        <meshStandardMaterial color={skinDark} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.065, 0.49]}>
        <boxGeometry args={[0.023, 0.075, 0.02]} />
        <meshStandardMaterial color={skinDark} roughness={0.88} />
      </mesh>

      {/* ── Mouth ─────────────────────────────────────── */}
      {/* Upper lip (fixed) */}
      <mesh position={[0, -0.136, 0.477]} scale={[0.128, 0.023, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color={lipCol} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Mouth interior — scaleY animated */}
      <mesh ref={interiorRef} position={[0, -0.162, 0.475]} scale={[0.098, 0.012, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="var(--raw-200808)" side={THREE.DoubleSide} />
      </mesh>

      {/* Lower lip — position.y animated */}
      <mesh ref={lowerLipRef} position={[0, -0.188, 0.473]} scale={[0.116, 0.022, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color={lipCol} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Neck ─────────────────────────────────────── */}
      <mesh position={[0, -0.66, 0]}>
        <cylinderGeometry args={[0.112, 0.128, 0.28, 24]} />
        <meshStandardMaterial color={skin} roughness={0.82} />
      </mesh>

      {/* ── Shoulders / shirt ────────────────────────── */}
      <mesh position={[0, -0.94, -0.06]}>
        <cylinderGeometry args={[0.35, 0.44, 0.38, 32]} />
        <meshStandardMaterial color={cloth} roughness={0.95} />
      </mesh>
      {/* Collar */}
      <mesh position={[0, -0.77, 0.1]}>
        <boxGeometry args={[0.14, 0.1, 0.05]} />
        <meshStandardMaterial color="white" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  GLB MODEL — used when /public/avatar.glb exists (Ready Player Me)
// ══════════════════════════════════════════════════════════════════════════════
function GLBAvatarModel({
  isAiSpeaking,
  mouthOpenness,
}: {
  isAiSpeaking: boolean;
  mouthOpenness: number;
}) {
  const { scene } = useGLTF("/avatar.glb");
  const headMesh   = useRef<THREE.SkinnedMesh | null>(null);
  const smooth     = useRef(0);

  useEffect(() => {
    let best: THREE.SkinnedMesh | null = null;
    scene.traverse((child) => {
      if (
        child instanceof THREE.SkinnedMesh &&
        child.morphTargetDictionary &&
        child.morphTargetInfluences
      ) {
        const count = Object.keys(child.morphTargetDictionary).length;
        if (!best || count > Object.keys(best.morphTargetDictionary!).length) {
          best = child;
        }
      }
    });
    headMesh.current = best;
    if (best) {
      console.log("[Avatar3D] Morph targets:", Object.keys(best.morphTargetDictionary!).join(", "));
    }
  }, [scene]);

  useFrame((_, delta) => {
    const mesh = headMesh.current;
    if (!mesh?.morphTargetInfluences || !mesh.morphTargetDictionary) return;

    const target = isAiSpeaking ? mouthOpenness : 0;
    smooth.current = THREE.MathUtils.lerp(smooth.current, target, Math.min(1, delta * 15));
    const v = smooth.current;
    const d = mesh.morphTargetDictionary;
    const inf = mesh.morphTargetInfluences;

    if ("mouthOpen"  in d) inf[d["mouthOpen"]]  = v;
    if ("viseme_aa"  in d) inf[d["viseme_aa"]]  = v * 0.65;
    if ("viseme_O"   in d) inf[d["viseme_O"]]   = v * 0.30;
    if ("viseme_E"   in d) inf[d["viseme_E"]]   = v * 0.15;
  });

  return <primitive object={scene} position={[0, 0, 0]} scale={1} />;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCENE — tries GLB first, falls back to procedural head
// ══════════════════════════════════════════════════════════════════════════════
function ProceduralScene({
  isAiSpeaking,
  mouthOpenness,
}: {
  isAiSpeaking: boolean;
  mouthOpenness: number;
}) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[1.5, 3,   2.5]} intensity={1.6} />
      <directionalLight position={[-2,  2,  -1.5]} intensity={0.5} />
      <pointLight       position={[0,   2.2, 1.8]} intensity={0.6} color="var(--raw-fff5e8)" />
      <ProceduralHead isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />
    </>
  );
}

function GLBScene({
  isAiSpeaking,
  mouthOpenness,
}: {
  isAiSpeaking: boolean;
  mouthOpenness: number;
}) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[1.5, 3.5, 2.5]} intensity={1.6} castShadow={false} />
      <directionalLight position={[-2,  2,  -1.5]} intensity={0.5} />
      <pointLight       position={[0,   2.2, 1.8]} intensity={0.6} color="var(--raw-fff8f0)" />
      <Suspense fallback={<ProceduralHead isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />}>
        <GLBAvatarModel isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />
      </Suspense>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PUBLIC COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

/** Set to true once you have /public/avatar.glb from readyplayer.me */
const USE_GLB_AVATAR = false;

export function Avatar3D({
  isAiSpeaking,
  mouthOpenness,
  className = "",
  style,
}: Avatar3DProps) {
  // Camera for procedural head: head centred at y≈0, camera pulled back
  // Camera for GLB (RPM):       head at y≈1.58, camera looks at head height
  const cameraPos: [number, number, number] = USE_GLB_AVATAR
    ? [0, 1.58, 1.35]
    : [0, 0.05, 1.3];
  const cameraLookAt: [number, number, number] = USE_GLB_AVATAR
    ? [0, 1.55, 0]
    : [0, 0.05, 0];

  return (
    <AvatarErrorBoundary
      fallback={
        <Canvas
          className={className}
          style={style}
          camera={{ position: [0, 0.05, 1.3], fov: 38 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 1.5]}
        >
          <ProceduralScene isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />
        </Canvas>
      }
    >
      <Canvas
        className={className}
        style={style}
        camera={{ position: cameraPos, fov: 38 }}
        onCreated={({ camera }) => { camera.lookAt(...cameraLookAt); }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
      >
        {USE_GLB_AVATAR ? (
          <GLBScene isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />
        ) : (
          <ProceduralScene isAiSpeaking={isAiSpeaking} mouthOpenness={mouthOpenness} />
        )}
      </Canvas>
    </AvatarErrorBoundary>
  );
}
