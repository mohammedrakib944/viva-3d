"use client";

import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { TEN_Z } from "./data";

const LOGO_URL = "/3d-models/logo-optimized.glb";
const TARGET_HEIGHT = 2.6;
// A clean, continuous automatic spin — no mouse control needed.
const AUTO_SPIN_SPEED = 0.25;

// Three's physically-correct lighting falls off as intensity / distance² —
// matching the intensities used for the flying hero's own light rig so the
// logo's real PBR material reads clearly rather than rendering near-black.
const KEY_LIGHT_INTENSITY = 55;
const ACCENT_LIGHT_INTENSITY = 32;

function useFinaleVisibility() {
  const { progressRef } = useScroll();
  return () => {
    const p = progressRef.current.value;
    // Rises in and then stays fully visible through the end of the scroll
    // — it's the final resting piece, not a transition to fade past.
    return THREE.MathUtils.clamp((p - 0.86) / 0.09, 0, 1);
  };
}

function LogoModel() {
  const getVisibility = useFinaleVisibility();
  const groupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);
  const accentLightRef = useRef<THREE.PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const pulse = useRef(0);
  const glowColor = useRef(new THREE.Color("#4fd6ff"));

  const { scene } = useGLTF(LOGO_URL);

  // The source export's scale/pivot is arbitrary — normalize to a known
  // height, centered on its own origin.
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    const rawScale = TARGET_HEIGHT / Math.max(size.y, 0.0001);
    const scale = Number.isFinite(rawScale)
      ? THREE.MathUtils.clamp(rawScale, 0.001, 1000)
      : 1;
    clone.scale.setScalar(scale);

    return clone;
  }, [scene]);

  useFrame((state, delta) => {
    const visibility = getVisibility();
    pulse.current = Math.max(0, pulse.current - delta * 1.8);

    if (groupRef.current) {
      groupRef.current.visible = visibility > 0.01;
      const pulseBump = 1 + pulse.current * 0.2;
      groupRef.current.scale.setScalar(visibility * pulseBump);
      groupRef.current.rotation.y += delta * AUTO_SPIN_SPEED;
    }

    // The accent light still gives a little glow feedback on hover/click —
    // that's not rotation control, just a nice touch.
    glowColor.current.set("#4fd6ff").lerp(new THREE.Color("#ffffff"), pulse.current);

    if (keyLightRef.current) {
      const targetIntensity =
        (hovered ? KEY_LIGHT_INTENSITY * 1.3 : KEY_LIGHT_INTENSITY) *
        visibility *
        (1 + pulse.current * 0.8);
      keyLightRef.current.intensity = THREE.MathUtils.lerp(
        keyLightRef.current.intensity,
        targetIntensity,
        0.12
      );
    }
    if (accentLightRef.current) {
      accentLightRef.current.color.copy(glowColor.current);
      const targetIntensity = ACCENT_LIGHT_INTENSITY * visibility * (1 + pulse.current * 0.6);
      accentLightRef.current.intensity = THREE.MathUtils.lerp(
        accentLightRef.current.intensity,
        targetIntensity,
        0.12
      );
    }
  });

  return (
    <group
      ref={groupRef}
      position={[0, 0, TEN_Z]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        // Native cursor is hidden globally in favor of the custom star
        // cursor (see globals.css) — signal hover to it instead.
        window.dispatchEvent(new CustomEvent("cursor-hover", { detail: true }));
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(false);
        window.dispatchEvent(new CustomEvent("cursor-hover", { detail: false }));
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        pulse.current = 1;
      }}
    >
      <pointLight
        ref={keyLightRef}
        color="#ffffff"
        intensity={KEY_LIGHT_INTENSITY}
        distance={16}
        position={[2.5, 2, 4]}
      />
      <pointLight
        ref={accentLightRef}
        color="#4fd6ff"
        intensity={ACCENT_LIGHT_INTENSITY}
        distance={14}
        position={[-2.5, -1.5, 5]}
      />
      <primitive object={model} />
    </group>
  );
}

class LogoBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("LogoFinale failed to load — hiding it.", error);
  }
  render() {
    // If the model fails to load for any reason, just don't render it —
    // never take the rest of the scene down with it.
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function LogoFinale() {
  return (
    <LogoBoundary>
      <Suspense fallback={null}>
        <LogoModel />
      </Suspense>
    </LogoBoundary>
  );
}
