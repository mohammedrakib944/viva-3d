"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import * as THREE from "three";
import { MILESTONES } from "./data";

const SPACING = 7.5;
const START_Z = -8;

// Overshoots slightly past 1 before settling — gives the card a small
// "pop" as it scales in rather than a flat linear grow.
function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const t = x - 1;
  return 1 + c3 * t * t * t + c1 * t * t;
}

export default function YearStoryCards() {
  const htmlRefs = useRef<(HTMLDivElement | null)[]>([]);

  useFrame((state) => {
    const camZ = state.camera.position.z;
    htmlRefs.current.forEach((el, i) => {
      if (!el) return;
      const markerZ = START_Z - i * SPACING;
      const dist = Math.abs(camZ - (markerZ + 3));
      const proximity = THREE.MathUtils.clamp(1.4 - dist / 6, 0, 1);
      el.style.opacity = String(proximity);
      const scale = THREE.MathUtils.lerp(0.55, 1, easeOutBack(proximity));
      el.style.transform = `scale(${Math.max(0, scale)})`;
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
              className="flex w-[210px] select-none items-center gap-3.5 rounded-lg border p-4 backdrop-blur-sm transition-[opacity] duration-300"
              style={{
                opacity: 0,
                background: `linear-gradient(135deg, ${m.client.color}14, rgba(255,255,255,0.03))`,
                borderColor: `${m.client.color}55`,
                boxShadow: `0 0 24px -6px ${m.client.color}66`,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold text-black"
                style={{
                  background: m.client.color,
                  boxShadow: `0 0 16px -2px ${m.client.color}`,
                }}
              >
                {m.client.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">
                  {m.client.name}
                </div>
                <div className="truncate font-mono text-[10px] tracking-[0.2em] text-white/55">
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
