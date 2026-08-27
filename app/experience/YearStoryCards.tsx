"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import * as THREE from "three";
import { MILESTONES } from "./data";

const SPACING = 7.5;
const START_Z = -8;

export default function YearStoryCards() {
  const htmlRefs = useRef<(HTMLDivElement | null)[]>([]);

  useFrame((state) => {
    const camZ = state.camera.position.z;
    htmlRefs.current.forEach((el, i) => {
      if (!el) return;
      const markerZ = START_Z - i * SPACING;
      const dist = Math.abs(camZ - (markerZ + 3));
      const opacity = THREE.MathUtils.clamp(1.4 - dist / 6, 0, 1);
      el.style.opacity = String(opacity);
    });
  });

  return (
    <>
      {MILESTONES.map((m, i) => (
        <Billboard
          key={m.year}
          position={[
            i % 2 === 0 ? 2.6 : -2.6,
            -0.6,
            START_Z - i * SPACING,
          ]}
        >
          <Html center occlude={false} sprite>
            <div
              ref={(el) => {
                htmlRefs.current[i] = el;
              }}
              className="flex w-[170px] select-none items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm transition-opacity duration-300"
              style={{ opacity: 0 }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-black"
                style={{ background: m.client.color }}
              >
                {m.client.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-white">
                  {m.client.name}
                </div>
                <div className="truncate font-mono text-[8px] tracking-[0.2em] text-white/40">
                  {m.client.tag}
                </div>
              </div>
            </div>
          </Html>
        </Billboard>
      ))}
    </>
  );
}
