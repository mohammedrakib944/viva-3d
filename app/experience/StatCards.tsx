"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import * as THREE from "three";
import { STAT_CARDS, TUNNEL_LENGTH } from "./data";

const START_Z = -32;
const SPACING = TUNNEL_LENGTH / (STAT_CARDS.length + 1);

export default function StatCards() {
  const htmlRefs = useRef<(HTMLDivElement | null)[]>([]);

  useFrame((state) => {
    const camZ = state.camera.position.z;
    htmlRefs.current.forEach((el, i) => {
      if (!el) return;
      const cardZ = START_Z - i * SPACING;
      const dist = Math.abs(camZ - (cardZ + 4));
      const opacity = THREE.MathUtils.clamp(1.3 - dist / 5, 0, 1);
      el.style.opacity = String(opacity);
    });
  });

  return (
    <>
      {STAT_CARDS.map((s, i) => (
        <Billboard
          key={s.label}
          position={[
            i % 2 === 0 ? 3.4 : -3.4,
            i % 2 === 0 ? 0.6 : -0.4,
            START_Z - i * SPACING,
          ]}
        >
          <Html center occlude={false} sprite>
            <div
              ref={(el) => {
                htmlRefs.current[i] = el;
              }}
              className="w-[150px] select-none rounded-sm border border-white/10 bg-white/[0.03] px-4 py-3 text-center backdrop-blur-sm transition-opacity duration-300"
              style={{ opacity: 0 }}
            >
              <div className="font-mono text-lg font-semibold tracking-wide text-[--accent]">
                {s.value}
              </div>
              <div className="mt-1 font-mono text-[9px] tracking-[0.25em] text-white/50">
                {s.label}
              </div>
            </div>
          </Html>
        </Billboard>
      ))}
    </>
  );
}
