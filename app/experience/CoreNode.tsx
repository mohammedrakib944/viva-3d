"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";

const SATELLITES = 8;

function makeOrbit(i: number): {
  radius: number;
  speed: number;
  phase: number;
  incline: number;
} {
  return {
    radius: 1.1 + (i % 3) * 0.35,
    speed: 0.35 + (i % 4) * 0.12,
    phase: (i / SATELLITES) * Math.PI * 2,
    incline: (i * 0.73) % Math.PI,
  };
}

export default function CoreNode() {
  const { progressRef } = useScroll();
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const innerMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const satelliteRefs = useRef<(THREE.Mesh | null)[]>([]);

  const orbits = useMemo(
    () => Array.from({ length: SATELLITES }, (_, i) => makeOrbit(i)),
    []
  );

  const lines = useMemo(
    () =>
      orbits.map(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(6), 3)
        );
        const material = new THREE.LineBasicMaterial({
          color: "#4fd6ff",
          transparent: true,
          opacity: 0.3,
        });
        return new THREE.Line(geometry, material);
      }),
    [orbits]
  );

  useFrame((state, delta) => {
    const p = progressRef.current.value;
    const visibility = THREE.MathUtils.clamp(1 - p / 0.18, 0, 1);
    const spawnT = THREE.MathUtils.clamp(p / 0.12, 0, 1);
    const activeCount = Math.round(spawnT * SATELLITES);

    if (materialRef.current) materialRef.current.opacity = visibility * 0.9;
    if (innerMaterialRef.current)
      innerMaterialRef.current.opacity = visibility;

    if (groupRef.current) {
      groupRef.current.visible = visibility > 0.01;
      groupRef.current.rotation.y += delta * 0.25;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.06;
      groupRef.current.scale.setScalar(pulse * (0.6 + visibility * 0.4));
    }

    orbits.forEach((orbit, i) => {
      const mesh = satelliteRefs.current[i];
      const line = lines[i];
      const active = i < activeCount;
      const t = state.clock.elapsedTime * orbit.speed + orbit.phase;

      const x = Math.cos(t) * orbit.radius;
      const z = Math.sin(t) * orbit.radius;
      const y = Math.sin(t * 0.7 + orbit.incline) * orbit.radius * 0.4;

      if (mesh) {
        mesh.visible = active && visibility > 0.01;
        mesh.position.set(x, y, z);
        const s = 0.06 + (active ? 0.03 : 0);
        mesh.scale.setScalar(s);
      }

      if (line) {
        line.visible = active && visibility > 0.01;
        const positions = line.geometry.getAttribute(
          "position"
        ) as THREE.BufferAttribute;
        positions.setXYZ(0, 0, 0, 0);
        positions.setXYZ(1, x, y, z);
        positions.needsUpdate = true;
        const mat = line.material as THREE.LineBasicMaterial;
        mat.opacity = visibility * 0.35;
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, -1]}>
      {/* outer wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial
          ref={materialRef}
          color="#4fd6ff"
          wireframe
          transparent
          opacity={1}
        />
      </mesh>

      {/* inner glowing core */}
      <mesh>
        <icosahedronGeometry args={[0.24, 2]} />
        <meshBasicMaterial
          ref={innerMaterialRef}
          color="#ffffff"
          transparent
          opacity={1}
        />
      </mesh>

      <pointLight color="#4fd6ff" intensity={4} distance={6} />

      {/* satellite nodes: the seed generating more nodes */}
      {orbits.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            satelliteRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color="#4fd6ff" transparent opacity={0.9} />
        </mesh>
      ))}

      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}
