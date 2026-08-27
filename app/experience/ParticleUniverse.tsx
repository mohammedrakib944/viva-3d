"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { TEN_Z, TUNNEL_LENGTH } from "./data";

const COUNT = 1400;
const CONVERGE_Z = TEN_Z;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export default function ParticleUniverse() {
  const { progressRef } = useScroll();
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);

  const { base, converge, colors } = useMemo(() => {
    const base = new Float32Array(COUNT * 3);
    const converge = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    const cyan = new THREE.Color("#4fd6ff");
    const white = new THREE.Color("#ffffff");

    for (let i = 0; i < COUNT; i++) {
      const s = i / COUNT;
      const angle = Math.random() * Math.PI * 2 + s * 14;
      const radius = 1.6 + Math.random() * 1.4;
      const z = -s * TUNNEL_LENGTH - Math.random() * 2;

      base[i * 3] = Math.cos(angle) * radius;
      base[i * 3 + 1] = Math.sin(angle) * radius;
      base[i * 3 + 2] = z;

      // Converge into a glowing halo ring that frames the 3D "10" rather
      // than a crude particle-drawn silhouette of the digits themselves.
      const ringAngle = Math.random() * Math.PI * 2;
      const ringRadius = 3.1 + Math.random() * 1.3;
      const wobble = (Math.random() - 0.5) * 0.4;
      converge[i * 3] = Math.cos(ringAngle) * (ringRadius + wobble);
      converge[i * 3 + 1] = Math.sin(ringAngle) * (ringRadius + wobble) * 0.55;
      converge[i * 3 + 2] =
        CONVERGE_Z + Math.sin(ringAngle * 2 + s * 6) * 1.1;

      const mixed = cyan.clone().lerp(white, Math.random() * 0.5);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    return { base, converge, colors };
  }, []);

  const positions = useMemo(() => new Float32Array(base), [base]);
  const prevBlend = useRef(-1);

  useFrame((state, delta) => {
    const p = progressRef.current.value;
    const blend = smoothstep(0.8, 1, p);

    // Only touch the buffer (and trigger a GPU re-upload) when the
    // convergence blend actually changes. Re-uploading ~4k floats every
    // single frame regardless of state is expensive enough to cause
    // frame stutter and, on weaker/software GPUs, WebGL context loss.
    const changed = Math.abs(blend - prevBlend.current) > 0.0005;
    if (changed) {
      const geom = pointsRef.current?.geometry;
      if (geom) {
        const attr = geom.getAttribute("position") as THREE.BufferAttribute;
        if (blend <= 0.0005) {
          (attr.array as Float32Array).set(base);
        } else {
          for (let i = 0; i < COUNT; i++) {
            const ix = i * 3;
            attr.array[ix] = THREE.MathUtils.lerp(base[ix], converge[ix], blend);
            attr.array[ix + 1] = THREE.MathUtils.lerp(
              base[ix + 1],
              converge[ix + 1],
              blend
            );
            attr.array[ix + 2] = THREE.MathUtils.lerp(
              base[ix + 2],
              converge[ix + 2],
              blend
            );
          }
        }
        attr.needsUpdate = true;
      }
      prevBlend.current = blend;
    }

    if (groupRef.current) {
      // Slow drift through the tunnel, speeding into a gentle halo swirl
      // once fully converged around the "10".
      const spinSpeed = THREE.MathUtils.lerp(0.02, 0.06, blend);
      groupRef.current.rotation.z += delta * spinSpeed;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={COUNT}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          vertexColors
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}
