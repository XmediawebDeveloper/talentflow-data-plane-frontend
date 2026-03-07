import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { AvatarState } from "@/hooks/useAvatarState";
import {
  VISEME_NAMES,
  type VisemeWeights,
  type LogicalBone,
  BONE_NAME_CANDIDATES,
  type LogicalMorph,
  MORPH_NAME_CANDIDATES,
  OCULUS_TO_ARKIT_VISEME_MAP,
} from "./avatar3d-types";

interface Avatar3DModelProps {
  stateRef: React.MutableRefObject<{
    avatarState: AvatarState;
    mouthOpenness: number;
    visemeWeights: VisemeWeights;
  }>;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Reusable objects to avoid GC per frame
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _euler2 = new THREE.Euler();
const _quat2 = new THREE.Quaternion();

export function Avatar3DModel({ stateRef }: Avatar3DModelProps) {
  const { scene } = useGLTF("/models/linda-avatar.glb");

  // Clone scene once so we get our own morph target influences
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences = [...mesh.morphTargetInfluences];
      }
    });
    return c;
  }, [scene]);

  // ── Professional HR outfit material override ─────────────────────────────
  // Recolors the avatar's clothing meshes to look like a professional
  // businesswoman (dark navy blazer, matching bottoms, dark shoes).
  useMemo(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const name = mesh.name.toLowerCase();

      // Outfit top → dark charcoal blazer
      if (name.includes("outfit_top") || name.includes("top") && name.includes("outfit")) {
        const mat = (mesh.material as THREE.MeshStandardMaterial);
        if (mat?.isMeshStandardMaterial) {
          mesh.material = mat.clone();
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.map = null;
          m.normalMap = null;
          m.color.set(0x2a2a2e);       // Dark charcoal blazer
          m.roughness = 0.7;
          m.metalness = 0.0;
          m.needsUpdate = true;
        }
      }

      // Outfit bottom → black formal trousers
      if (name.includes("outfit_bottom") || name.includes("bottom") && name.includes("outfit")) {
        const mat = (mesh.material as THREE.MeshStandardMaterial);
        if (mat?.isMeshStandardMaterial) {
          mesh.material = mat.clone();
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.map = null;
          m.normalMap = null;
          m.color.set(0x1e1e22);       // Black trousers
          m.roughness = 0.65;
          m.metalness = 0.0;
          m.needsUpdate = true;
        }
      }

      // Footwear → black formal heels
      if (name.includes("footwear") || name.includes("shoe")) {
        const mat = (mesh.material as THREE.MeshStandardMaterial);
        if (mat?.isMeshStandardMaterial) {
          mesh.material = mat.clone();
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.map = null;
          m.normalMap = null;
          m.color.set(0x0a0a0c);       // Black
          m.roughness = 0.25;
          m.metalness = 0.08;
          m.needsUpdate = true;
        }
      }
    });

    if (process.env.NODE_ENV === "development") {
      const meshNames: string[] = [];
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshNames.push(child.name);
      });
      console.log("[Avatar3D] Mesh names:", meshNames.join(", "));
    }
  }, [clone]);

  // Collect skinned meshes with morph targets from our clone
  const morphMeshes = useMemo(() => {
    const meshes: THREE.SkinnedMesh[] = [];
    clone.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (
        mesh.isSkinnedMesh &&
        mesh.morphTargetDictionary &&
        mesh.morphTargetInfluences
      ) {
        meshes.push(mesh);
      }
    });
    return meshes;
  }, [clone]);

  // ── Step 2: Systematic bone detection ──────────────────────────────────
  const bones = useMemo(() => {
    // Build lookup map of all bones by exact name
    const boneMap = new Map<string, THREE.Bone>();
    clone.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        boneMap.set(child.name, child as THREE.Bone);
      }
    });

    const result: Partial<Record<LogicalBone, THREE.Bone>> = {};

    for (const [logical, candidates] of Object.entries(BONE_NAME_CANDIDATES) as [
      LogicalBone,
      string[],
    ][]) {
      // Exact match first (O(1))
      for (const candidate of candidates) {
        if (boneMap.has(candidate)) {
          result[logical] = boneMap.get(candidate)!;
          break;
        }
      }
      // Suffix match fallback (for prefixed rigs like "Armature|Head")
      if (!result[logical]) {
        for (const candidate of candidates) {
          for (const [name, bone] of boneMap) {
            if (name.endsWith(candidate)) {
              result[logical] = bone;
              break;
            }
          }
          if (result[logical]) break;
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      const detected = Object.keys(result).join(", ");
      console.log(`[Avatar3D] Bones detected: ${detected}`);
    }

    return result;
  }, [clone]);

  // ── Step 3: Morph target resolution ────────────────────────────────────
  const morphConfig = useMemo(() => {
    type MeshMorphMap = {
      mesh: THREE.SkinnedMesh;
      resolved: Partial<Record<LogicalMorph, number>>;
    };

    // Determine mode: oculus, arkit, or none
    let mode: "oculus" | "arkit" | "none" = "none";
    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary!;
      if (dict["viseme_sil"] !== undefined) {
        mode = "oculus";
        break;
      }
      if (dict["jawOpen"] !== undefined || dict["mouthSmileLeft"] !== undefined) {
        mode = "arkit";
        break;
      }
    }

    // Resolve logical morph names to actual indices per mesh
    const meshMorphMaps: MeshMorphMap[] = morphMeshes.map((mesh) => {
      const dict = mesh.morphTargetDictionary!;
      const resolved: Partial<Record<LogicalMorph, number>> = {};

      for (const [logical, candidates] of Object.entries(MORPH_NAME_CANDIDATES) as [
        LogicalMorph,
        string[],
      ][]) {
        for (const candidate of candidates) {
          if (dict[candidate] !== undefined) {
            resolved[logical] = dict[candidate];
            break;
          }
        }
      }
      return { mesh, resolved };
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[Avatar3D] Morph target mode: ${mode}`);
    }

    return { mode, meshMorphMaps };
  }, [morphMeshes]);

  // Store initial bone quaternions for resetting each frame
  const initialRotations = useMemo(() => {
    const map = new Map<LogicalBone, THREE.Quaternion>();
    for (const [key, bone] of Object.entries(bones) as [
      LogicalBone,
      THREE.Bone | undefined,
    ][]) {
      if (bone) map.set(key, bone.quaternion.clone());
    }
    return map;
  }, [bones]);

  // ── Animation refs (no React re-renders) ───────────────────────────────
  const blinkTimer = useRef(0);
  const nextBlinkAt = useRef(3 + Math.random() * 2);
  const isBlinking = useRef(false);
  const blinkProgress = useRef(0);
  const smoothedVisemes = useRef<Record<string, number>>({});
  const smoothedHandRaise = useRef(0);
  const smoothedWaveAngle = useRef(0);

  // New refs for enhanced body language
  const idleSwayPhase = useRef(Math.random() * Math.PI * 2);
  const speakingGesturePhase = useRef(0);
  const smoothedLeanForward = useRef(0);
  const smoothedTorsoLean = useRef(0);
  const smoothedRightGesture = useRef(0);
  const smoothedLeftGesture = useRef(0);
  const smoothedThinkingTilt = useRef(0);

  // Eye saccade refs
  const saccadeTimer = useRef(0);
  const nextSaccadeAt = useRef(0.2 + Math.random() * 0.6);
  const saccadeTargetX = useRef(0);
  const saccadeTargetY = useRef(0);
  const saccadeCurrentX = useRef(0);
  const saccadeCurrentY = useRef(0);

  useFrame((_, delta) => {
    const { avatarState, visemeWeights } = stateRef.current;
    const t = performance.now() / 1000;

    // ── 1. Viseme morph targets (dual-mode) ─────────────────────────────
    for (const { mesh, resolved } of morphConfig.meshMorphMaps) {
      const dict = mesh.morphTargetDictionary!;
      const influences = mesh.morphTargetInfluences!;

      if (morphConfig.mode === "oculus") {
        // Direct Oculus viseme application (RPM models)
        for (const visemeName of VISEME_NAMES) {
          const idx = dict[visemeName];
          if (idx !== undefined) {
            const target = visemeWeights[visemeName] ?? 0;
            const key = `${mesh.uuid}_${visemeName}`;
            const current = smoothedVisemes.current[key] ?? 0;
            const smoothed = lerp(current, target, delta * 12);
            smoothedVisemes.current[key] = smoothed;
            influences[idx] = smoothed;
          }
        }
      } else if (morphConfig.mode === "arkit") {
        // Convert Oculus visemes → ARKit blendshapes
        const arkitAccum: Partial<Record<LogicalMorph, number>> = {};

        for (const visemeName of VISEME_NAMES) {
          const weight = visemeWeights[visemeName] ?? 0;
          if (weight < 0.001) continue;

          const arkitMap = OCULUS_TO_ARKIT_VISEME_MAP[visemeName];
          for (const [morph, scale] of Object.entries(arkitMap) as [
            LogicalMorph,
            number,
          ][]) {
            arkitAccum[morph] = (arkitAccum[morph] ?? 0) + weight * scale;
          }
        }

        // Apply accumulated ARKit blendshapes with lerp smoothing
        for (const [morph, targetVal] of Object.entries(arkitAccum) as [
          LogicalMorph,
          number,
        ][]) {
          const idx = resolved[morph];
          if (idx !== undefined) {
            const clamped = clamp(targetVal, 0, 1);
            const key = `${mesh.uuid}_arkit_${morph}`;
            const current = smoothedVisemes.current[key] ?? 0;
            const smoothed = lerp(current, clamped, delta * 12);
            smoothedVisemes.current[key] = smoothed;
            influences[idx] = smoothed;
          }
        }
      }

      // ── 2. Eye blinking (using resolved indices) ────────────────────
      blinkTimer.current += delta;
      if (
        !isBlinking.current &&
        blinkTimer.current >= nextBlinkAt.current
      ) {
        isBlinking.current = true;
        blinkProgress.current = 0;
        blinkTimer.current = 0;
        nextBlinkAt.current = 3 + Math.random() * 2;
      }

      if (isBlinking.current) {
        blinkProgress.current += delta / 0.15;
        const blinkValue =
          blinkProgress.current < 0.5
            ? blinkProgress.current * 2
            : 2 - blinkProgress.current * 2;
        const clamped = clamp(blinkValue, 0, 1);

        const leftBlinkIdx = resolved.eyeBlinkLeft;
        const rightBlinkIdx = resolved.eyeBlinkRight;
        if (leftBlinkIdx !== undefined) influences[leftBlinkIdx] = clamped;
        if (rightBlinkIdx !== undefined) influences[rightBlinkIdx] = clamped;

        if (blinkProgress.current >= 1) {
          isBlinking.current = false;
          if (leftBlinkIdx !== undefined) influences[leftBlinkIdx] = 0;
          if (rightBlinkIdx !== undefined) influences[rightBlinkIdx] = 0;
        }
      }

      // ── 3. Facial expressions per state (using resolved indices) ────
      let smileTarget = 0,
        browUpTarget = 0,
        eyeUpTarget = 0;
      switch (avatarState) {
        case "idle":
          smileTarget = 0.2;
          break;
        case "listening":
          smileTarget = 0.3;
          browUpTarget = 0.15;
          break;
        case "thinking":
          browUpTarget = 0.4;
          eyeUpTarget = 0.25;
          break;
        case "speaking":
          smileTarget = 0.15;
          break;
        case "hand_raised":
          smileTarget = 0.4;
          browUpTarget = 0.2;
          break;
        case "waving":
          smileTarget = 0.6;
          break;
        case "nodding":
          smileTarget = 0.35;
          break;
      }

      const smileLeftIdx = resolved.mouthSmileLeft;
      const smileRightIdx = resolved.mouthSmileRight;
      const browInnerIdx = resolved.browInnerUp;
      const browLeftIdx = resolved.browUpLeft;
      const browRightIdx = resolved.browUpRight;
      const eyeUpIdx = resolved.eyeLookUpLeft;

      if (smileLeftIdx !== undefined)
        influences[smileLeftIdx] = lerp(
          influences[smileLeftIdx],
          smileTarget,
          delta * 5
        );
      if (smileRightIdx !== undefined)
        influences[smileRightIdx] = lerp(
          influences[smileRightIdx],
          smileTarget,
          delta * 5
        );
      if (browInnerIdx !== undefined)
        influences[browInnerIdx] = lerp(
          influences[browInnerIdx],
          browUpTarget,
          delta * 5
        );
      if (browLeftIdx !== undefined)
        influences[browLeftIdx] = lerp(
          influences[browLeftIdx],
          browUpTarget,
          delta * 5
        );
      if (browRightIdx !== undefined)
        influences[browRightIdx] = lerp(
          influences[browRightIdx],
          browUpTarget,
          delta * 5
        );
      if (eyeUpIdx !== undefined)
        influences[eyeUpIdx] = lerp(
          influences[eyeUpIdx],
          eyeUpTarget,
          delta * 5
        );

      // ── 4. Eye micro-saccades ───────────────────────────────────────
      saccadeTimer.current += delta;
      if (saccadeTimer.current >= nextSaccadeAt.current) {
        saccadeTimer.current = 0;
        nextSaccadeAt.current = 0.2 + Math.random() * 0.6;
        saccadeTargetX.current = (Math.random() - 0.5) * 0.06; // ±0.03
        saccadeTargetY.current = (Math.random() - 0.5) * 0.04; // ±0.02
      }

      // Fast lerp to target
      saccadeCurrentX.current = lerp(
        saccadeCurrentX.current,
        saccadeTargetX.current,
        delta * 20
      );
      saccadeCurrentY.current = lerp(
        saccadeCurrentY.current,
        saccadeTargetY.current,
        delta * 20
      );

      const sx = saccadeCurrentX.current;
      const sy = saccadeCurrentY.current;

      // Apply to eye look morph targets
      const lookInLeftIdx = resolved.eyeLookInLeft;
      const lookOutLeftIdx = resolved.eyeLookOutLeft;
      const lookInRightIdx = resolved.eyeLookInRight;
      const lookOutRightIdx = resolved.eyeLookOutRight;
      const lookUpLeftIdx = resolved.eyeLookUpLeft;
      const lookDownLeftIdx = resolved.eyeLookDownLeft;
      const lookUpRightIdx = resolved.eyeLookUpRight;
      const lookDownRightIdx = resolved.eyeLookDownRight;

      // Horizontal: positive sx = look right
      if (sx > 0) {
        if (lookOutLeftIdx !== undefined)
          influences[lookOutLeftIdx] = clamp(
            (influences[lookOutLeftIdx] || 0) + sx,
            0,
            1
          );
        if (lookInRightIdx !== undefined)
          influences[lookInRightIdx] = clamp(
            (influences[lookInRightIdx] || 0) + sx,
            0,
            1
          );
      } else {
        if (lookInLeftIdx !== undefined)
          influences[lookInLeftIdx] = clamp(
            (influences[lookInLeftIdx] || 0) + Math.abs(sx),
            0,
            1
          );
        if (lookOutRightIdx !== undefined)
          influences[lookOutRightIdx] = clamp(
            (influences[lookOutRightIdx] || 0) + Math.abs(sx),
            0,
            1
          );
      }

      // Vertical: positive sy = look up
      if (sy > 0) {
        if (lookUpLeftIdx !== undefined)
          influences[lookUpLeftIdx] = clamp(
            (influences[lookUpLeftIdx] || 0) + sy,
            0,
            1
          );
        if (lookUpRightIdx !== undefined)
          influences[lookUpRightIdx] = clamp(
            (influences[lookUpRightIdx] || 0) + sy,
            0,
            1
          );
      } else {
        if (lookDownLeftIdx !== undefined)
          influences[lookDownLeftIdx] = clamp(
            (influences[lookDownLeftIdx] || 0) + Math.abs(sy),
            0,
            1
          );
        if (lookDownRightIdx !== undefined)
          influences[lookDownRightIdx] = clamp(
            (influences[lookDownRightIdx] || 0) + Math.abs(sy),
            0,
            1
          );
      }
    }

    // ── 5. Procedural skeletal animations ───────────────────────────────
    // Reset all bones to initial pose
    for (const [key, bone] of Object.entries(bones) as [
      LogicalBone,
      THREE.Bone | undefined,
    ][]) {
      const initial = initialRotations.get(key);
      if (bone && initial) bone.quaternion.copy(initial);
    }

    // Advance phases
    idleSwayPhase.current += delta * 0.4;
    speakingGesturePhase.current += delta * 1.2;

    // ── Breathing (always active) ─────────────────────────────────────
    if (bones.Spine1) {
      _euler.set(Math.sin(t * 1.5) * 0.008, 0, 0);
      bones.Spine1.quaternion.multiply(_quat.setFromEuler(_euler));
    }
    if (bones.LeftShoulder) {
      _euler.set(0, 0, Math.sin(t * 1.5) * 0.003);
      bones.LeftShoulder.quaternion.multiply(_quat.setFromEuler(_euler));
    }
    if (bones.RightShoulder) {
      _euler.set(0, 0, -Math.sin(t * 1.5) * 0.003);
      bones.RightShoulder.quaternion.multiply(_quat.setFromEuler(_euler));
    }

    // ── Idle sway (idle, listening) ───────────────────────────────────
    if (avatarState === "idle" || avatarState === "listening") {
      const swayAmount = 0.012;
      const phase = idleSwayPhase.current;
      if (bones.Hips) {
        _euler.set(0, 0, Math.sin(phase) * swayAmount);
        bones.Hips.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      // S-curve counter-sway in upper spine
      if (bones.Spine2) {
        _euler.set(0, 0, -Math.sin(phase) * swayAmount * 0.6);
        bones.Spine2.quaternion.multiply(_quat.setFromEuler(_euler));
      }
    }

    // ── Listening lean (forward engagement) ───────────────────────────
    const leanTarget = avatarState === "listening" ? 0.04 : 0;
    smoothedLeanForward.current = lerp(
      smoothedLeanForward.current,
      leanTarget,
      delta * 3
    );
    if (bones.Spine && smoothedLeanForward.current > 0.001) {
      _euler.set(smoothedLeanForward.current, 0, 0);
      bones.Spine.quaternion.multiply(_quat.setFromEuler(_euler));
    }

    // ── Speaking torso lean ───────────────────────────────────────────
    const torsoLeanTarget = avatarState === "speaking" ? 0.025 : 0;
    smoothedTorsoLean.current = lerp(
      smoothedTorsoLean.current,
      torsoLeanTarget,
      delta * 3
    );
    if (bones.Spine1 && smoothedTorsoLean.current > 0.001) {
      _euler.set(smoothedTorsoLean.current, 0, 0);
      bones.Spine1.quaternion.multiply(_quat.setFromEuler(_euler));
    }

    // ── Head movement per state ───────────────────────────────────────
    if (bones.Head) {
      switch (avatarState) {
        case "speaking":
          _euler.set(
            Math.sin(t * 1.2) * 0.03,
            Math.sin(t * 0.8) * 0.02,
            Math.cos(t * 0.9) * 0.02
          );
          break;
        case "listening":
          // Slight tilt + micro-nods
          _euler.set(
            Math.sin(t * 2.5) * 0.008,
            0,
            Math.sin(t * 0.7) * 0.04
          );
          break;
        case "thinking":
          _euler.set(-0.08, 0, 0.04);
          break;
        case "nodding":
          _euler.set(Math.sin(t * 6) * 0.1, 0, 0);
          break;
        case "idle":
          _euler.set(
            Math.sin(t * 0.5) * 0.01,
            0,
            Math.cos(t * 0.3) * 0.008
          );
          break;
        default:
          _euler.set(0, 0, 0);
      }
      bones.Head.quaternion.multiply(_quat.setFromEuler(_euler));
    }

    // ── Neck follow (40% counter-rotation of head for speaking/listening) ─
    if (
      bones.Neck &&
      (avatarState === "speaking" || avatarState === "listening")
    ) {
      if (avatarState === "speaking") {
        _euler2.set(
          -Math.sin(t * 1.2) * 0.03 * 0.4,
          -Math.sin(t * 0.8) * 0.02 * 0.4,
          -Math.cos(t * 0.9) * 0.02 * 0.4
        );
      } else {
        _euler2.set(
          -Math.sin(t * 2.5) * 0.008 * 0.4,
          0,
          -Math.sin(t * 0.7) * 0.04 * 0.4
        );
      }
      bones.Neck.quaternion.multiply(_quat2.setFromEuler(_euler2));
    }

    // ── Hand resting position (idle, listening, thinking) ─────────────
    const restingStates: AvatarState[] = [
      "idle",
      "listening",
      "thinking",
    ];
    const isResting = restingStates.includes(avatarState);
    if (isResting) {
      // Slight natural bend in both arms — not stiff at sides
      if (bones.LeftUpperArm) {
        _euler.set(0.05, 0, -0.08);
        bones.LeftUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.LeftLowerArm) {
        _euler.set(0, 0.1, 0);
        bones.LeftLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.RightUpperArm) {
        _euler.set(0.05, 0, 0.08);
        bones.RightUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.RightLowerArm) {
        _euler.set(0, -0.1, 0);
        bones.RightLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
    }

    // ── Speaking gestures (both arms, slow sine wave, phase-offset) ───
    const speakingGestureTarget = avatarState === "speaking" ? 1 : 0;
    smoothedLeftGesture.current = lerp(
      smoothedLeftGesture.current,
      speakingGestureTarget,
      delta * 3
    );
    smoothedRightGesture.current = lerp(
      smoothedRightGesture.current,
      speakingGestureTarget,
      delta * 3
    );

    if (smoothedLeftGesture.current > 0.01) {
      const g = smoothedLeftGesture.current;
      const phase = speakingGesturePhase.current;

      if (bones.LeftUpperArm) {
        _euler.set(
          g * 0.1,
          0,
          g * (-0.15 + Math.sin(phase) * 0.06)
        );
        bones.LeftUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.LeftLowerArm) {
        _euler.set(0, g * (0.3 + Math.sin(phase * 0.7) * 0.08), 0);
        bones.LeftLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }

      // Right arm with phase offset
      if (bones.RightUpperArm) {
        _euler.set(
          g * 0.1,
          0,
          g * (0.15 + Math.sin(phase + 1.5) * 0.06)
        );
        bones.RightUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.RightLowerArm) {
        _euler.set(0, g * (-0.3 + Math.sin((phase + 1.5) * 0.7) * 0.08), 0);
        bones.RightLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
    }

    // ── Thinking pose (right hand rises toward chin) ──────────────────
    const thinkingTarget = avatarState === "thinking" ? 1 : 0;
    smoothedThinkingTilt.current = lerp(
      smoothedThinkingTilt.current,
      thinkingTarget,
      delta * 3
    );

    if (smoothedThinkingTilt.current > 0.01) {
      const th = smoothedThinkingTilt.current;
      if (bones.RightUpperArm) {
        _euler.set(th * 0.6, 0, th * 0.3);
        bones.RightUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
      if (bones.RightLowerArm) {
        _euler.set(0, th * -1.0, 0);
        bones.RightLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
      }
    }

    // ── Hand raise / wave (left arm — preserved) ──────────────────────
    const isHandUp =
      avatarState === "hand_raised" || avatarState === "waving";
    smoothedHandRaise.current = lerp(
      smoothedHandRaise.current,
      isHandUp ? 1 : 0,
      delta * 4
    );
    const h = smoothedHandRaise.current;

    if (bones.LeftUpperArm && h > 0.01) {
      _euler.set(0, 0, -h * 1.4);
      bones.LeftUpperArm.quaternion.multiply(_quat.setFromEuler(_euler));
    }
    if (bones.LeftLowerArm && h > 0.01) {
      _euler.set(0, h * 1.2, 0);
      bones.LeftLowerArm.quaternion.multiply(_quat.setFromEuler(_euler));
    }
    if (avatarState === "waving" && bones.LeftHand) {
      smoothedWaveAngle.current = lerp(
        smoothedWaveAngle.current,
        Math.sin(t * 8) * 0.5,
        delta * 10
      );
      _euler.set(0, 0, smoothedWaveAngle.current);
      bones.LeftHand.quaternion.multiply(_quat.setFromEuler(_euler));
    }
  });

  return <primitive object={clone} />;
}

useGLTF.preload("/models/linda-avatar.glb");
