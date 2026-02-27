import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { Avatar3DLighting } from "./Avatar3DLighting";
import { Avatar3DModel } from "./Avatar3DModel";
import {
  createAvatar3DReceiver,
  DEFAULT_AVATAR3D_STATE,
} from "./avatar3d-channel";
import type { Avatar3DState } from "./avatar3d-types";

/**
 * Auto-frames the camera to fit all meshes in the scene.
 * Runs once after the GLB model loads (skips lights/helpers).
 */
function CameraAutoFrame() {
  const { camera, scene } = useThree();
  const framed = useRef(false);

  useFrame(() => {
    if (framed.current) return;

    // Compute bounding box of meshes only (skip lights, cameras, helpers)
    const box = new THREE.Box3();
    let hasMesh = false;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
        box.expandByObject(child);
        hasMesh = true;
      }
    });

    if (!hasMesh || box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Wait until the model is actually loaded (size > trivial)
    if (size.y < 0.5) return;

    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = cam.fov * (Math.PI / 180);

    // Calculate distance needed to fit the full height with 15% padding
    const distance = (size.y / 2) / Math.tan(fovRad / 2) * 1.15;

    cam.position.set(center.x, center.y, center.z + distance);
    cam.lookAt(center);
    cam.updateProjectionMatrix();

    framed.current = true;
  });

  return null;
}

/**
 * Self-contained R3F scene for the 3D avatar.
 * Runs identically whether hosted in a Worker (OffscreenCanvas) or on the main thread.
 *
 * State is received via BroadcastChannel into a ref (no React re-renders).
 * Must be the default export so @react-three/offscreen can import it.
 */
export default function Avatar3DScene() {
  const stateRef = useRef<Avatar3DState>({ ...DEFAULT_AVATAR3D_STATE });

  useEffect(() => {
    const receiver = createAvatar3DReceiver((state) => {
      stateRef.current = state;
    });
    return () => receiver.destroy();
  }, []);

  return (
    <>
      <CameraAutoFrame />
      <Avatar3DLighting />
      <Avatar3DModel stateRef={stateRef} />
      <Environment preset="studio" />
    </>
  );
}
