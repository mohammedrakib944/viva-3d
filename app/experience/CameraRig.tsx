"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { TEN_Z, TUNNEL_LENGTH } from "./data";

function smoothstep(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export default function CameraRig() {
  const { progressRef } = useScroll();
  const targetPos = useRef(new THREE.Vector3(0, 0, 8));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const smoothPointer = useRef(new THREE.Vector2(0, 0));

  useFrame((state, delta) => {
    const p = progressRef.current.value;

    let camZ: number;
    let lookZ: number;

    if (p < 0.16) {
      const t = p / 0.16;
      camZ = THREE.MathUtils.lerp(9, 4.5, t);
      lookZ = camZ - 5;
    } else if (p < 0.82) {
      const t = (p - 0.16) / 0.66;
      camZ = THREE.MathUtils.lerp(4.5, -TUNNEL_LENGTH + 10, t);
      lookZ = camZ - 6;
    } else {
      // Ease smoothly to a comfortable resting distance from the "10"
      // instead of a linear approach that ended up only 2 units away.
      const t = smoothstep((p - 0.82) / 0.18);
      const restZ = TEN_Z + 9;
      camZ = THREE.MathUtils.lerp(-TUNNEL_LENGTH + 10, restZ, t);
      lookZ = THREE.MathUtils.lerp(camZ - 6, TEN_Z, t);
    }

    // Smooth the raw pointer input itself first, so quick mouse flicks
    // don't translate into a jittery camera — only gentle, lagged drift.
    smoothPointer.current.lerp(state.pointer, 0.06);
    const drift = smoothPointer.current;

    targetPos.current.set(
      Math.sin(p * 5) * 0.4 + drift.x * 0.4,
      Math.cos(p * 3.2) * 0.25 + drift.y * 0.25,
      camZ
    );
    targetLookAt.current.set(drift.x * 0.5, drift.y * 0.35, lookZ);

    const smoothing = 1 - Math.pow(0.0015, delta);
    state.camera.position.lerp(targetPos.current, smoothing);
    currentLookAt.current.lerp(targetLookAt.current, smoothing);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}
