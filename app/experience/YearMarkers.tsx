"use client";

import { Component, Suspense, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Center, Text, Text3D } from "@react-three/drei";
import * as THREE from "three";
import { FONT_URL, MILESTONES } from "./data";

const SPACING = 7.5;
const START_Z = -8;

function markerPosition(i: number): [number, number, number] {
  return [i % 2 === 0 ? -1.6 : 1.6, 0.3, START_Z - i * SPACING];
}

function YearMarkers3D() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const capMatRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const sideMatRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const outlineMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame((state) => {
    const camZ = state.camera.position.z;
    groupRefs.current.forEach((group, i) => {
      if (!group) return;
      const markerZ = START_Z - i * SPACING;
      const dist = Math.abs(camZ - (markerZ + 3));
      const opacity = THREE.MathUtils.clamp(1.4 - dist / 6, 0, 1);
      group.scale.setScalar(THREE.MathUtils.lerp(0.85, 1, opacity));
      const capMat = capMatRefs.current[i];
      if (capMat) capMat.opacity = opacity;
      const sideMat = sideMatRefs.current[i];
      if (sideMat) sideMat.opacity = opacity;
      const outlineMat = outlineMatRefs.current[i];
      if (outlineMat) outlineMat.opacity = opacity;
    });
  });

  return (
    <>
      {MILESTONES.map((m, i) => (
        <group
          key={m.year}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          position={markerPosition(i)}
        >
          <Center>
            <Text3D
              font={FONT_URL}
              size={0.85}
              height={0.16}
              curveSegments={10}
              bevelEnabled
              bevelThickness={0.02}
              bevelSize={0.014}
              bevelSegments={4}
            >
              {m.year}
              {/* Lighter cap faces, darker extrusion sides — same
                  dimensional shading as the "10" for consistency. */}
              <meshPhysicalMaterial
                ref={(el) => {
                  capMatRefs.current[i] = el;
                }}
                attach="material-0"
                color="#9595ec"
                emissive="#4fd6ff"
                emissiveIntensity={0.95}
                metalness={0.2}
                roughness={0.15}
                clearcoat={1}
                clearcoatRoughness={0.1}
                transparent
                opacity={0}
              />
              <meshPhysicalMaterial
                ref={(el) => {
                  sideMatRefs.current[i] = el;
                }}
                attach="material-1"
                color="#4b61e0"
                emissive="#4fd6ff"
                emissiveIntensity={0.95}
                metalness={0.2}
                roughness={0.2}
                clearcoat={1}
                clearcoatRoughness={0.12}
                transparent
                opacity={0}
              />
            </Text3D>
          </Center>

          {/* Outer shell: enlarged, back-face-only duplicate for a solid
              colored border instead of a thin edge line. */}
          <group scale={1.08}>
            <Center>
              <Text3D
                font={FONT_URL}
                size={0.85}
                height={0.16}
                curveSegments={10}
                bevelEnabled
                bevelThickness={0.02}
                bevelSize={0.014}
                bevelSegments={4}
              >
                {m.year}
                <meshStandardMaterial
                  ref={(el) => {
                    outlineMatRefs.current[i] = el;
                  }}
                  color="#2a3a8f"
                  emissive="#4b61e0"
                  emissiveIntensity={0.7}
                  roughness={0.4}
                  side={THREE.BackSide}
                  transparent
                  opacity={0}
                />
              </Text3D>
            </Center>
          </group>
        </group>
      ))}
    </>
  );
}

// Flat fallback in case the remote font fails to load — never crash the page.
function YearMarkersFlat() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state) => {
    const camZ = state.camera.position.z;
    groupRefs.current.forEach((group, i) => {
      if (!group) return;
      const markerZ = START_Z - i * SPACING;
      const dist = Math.abs(camZ - (markerZ + 3));
      const opacity = THREE.MathUtils.clamp(1.4 - dist / 6, 0, 1);
      group.scale.setScalar(THREE.MathUtils.lerp(0.85, 1, opacity));
      group.traverse((child) => {
        const mat = (child as THREE.Mesh).material as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (mat && !Array.isArray(mat) && "opacity" in mat) {
          (mat as THREE.MeshBasicMaterial).opacity = opacity;
        }
      });
    });
  });

  return (
    <>
      {MILESTONES.map((m, i) => (
        <group
          key={m.year}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          position={markerPosition(i)}
        >
          <Text
            fontSize={1.1}
            color="#eef2f7"
            anchorX="center"
            anchorY="middle"
            material-transparent
            material-opacity={1}
          >
            {m.year}
          </Text>
        </group>
      ))}
    </>
  );
}

class YearBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <YearMarkersFlat />;
    return this.props.children;
  }
}

export default function YearMarkers() {
  return (
    <YearBoundary>
      <Suspense fallback={null}>
        <YearMarkers3D />
      </Suspense>
    </YearBoundary>
  );
}
