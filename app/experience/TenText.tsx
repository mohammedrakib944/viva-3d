"use client";

import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Center, Text, Text3D } from "@react-three/drei";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { FONT_URL, TEN_Z } from "./data";

function useTenVisibility() {
  const { progressRef } = useScroll();
  return () => {
    const p = progressRef.current.value;
    // Rises in and then stays fully visible through the end of the scroll
    // — it's the final resting piece, not a transition to fade past.
    return THREE.MathUtils.clamp((p - 0.86) / 0.09, 0, 1);
  };
}

function Ten3D() {
  const getVisibility = useTenVisibility();
  const groupRef = useRef<THREE.Group>(null);
  // Two material groups: the front/back cap faces (lighter) and the
  // extrusion side faces (darker) — real dimensional shading rather than
  // a single flat color, so the 3D form reads clearly at a glance.
  const capMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const sideMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  // A slightly enlarged, back-face-only duplicate — the classic
  // inverted-hull outline trick — gives a real solid-colored outer shell
  // instead of a thin border line.
  const outlineMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const pulse = useRef(0);
  const targetTilt = useRef(new THREE.Vector2(0, 0));
  const currentTilt = useRef(new THREE.Vector2(0, 0));
  const idleSpin = useRef(0);
  const glowColor = useRef(new THREE.Color("#4fd6ff"));

  // Drag-to-rotate: click and drag the "10" to spin it directly. The
  // rotation this produces persists (dragRotation) instead of springing
  // back, so it genuinely feels controllable rather than just reactive.
  // Momentum coasts a long time and a double-click gives it a hard flick,
  // so it actually feels like a toy you're playing with.
  const draggingRef = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragRotation = useRef(new THREE.Vector2(0, 0));
  const dragVelocity = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      dragRotation.current.x += dx * 0.012;
      dragRotation.current.y += dy * 0.012;
      dragVelocity.current.set(dx * 0.012, dy * 0.012);
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        window.dispatchEvent(new CustomEvent("cursor-drag", { detail: false }));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useFrame((state, delta) => {
    const visibility = getVisibility();

    targetTilt.current.set(state.pointer.x, state.pointer.y);
    currentTilt.current.lerp(targetTilt.current, 0.05);
    pulse.current = Math.max(0, pulse.current - delta * 1.8);

    if (!draggingRef.current) {
      // Let released drag spin gently coast to a stop, otherwise idle-spin.
      if (dragVelocity.current.lengthSq() > 0.000005) {
        dragRotation.current.x += dragVelocity.current.x;
        dragRotation.current.y += dragVelocity.current.y;
        dragVelocity.current.multiplyScalar(0.975);
      } else {
        idleSpin.current += delta * 0.06;
      }
    }

    if (groupRef.current) {
      groupRef.current.visible = visibility > 0.01;
      const baseScale = THREE.MathUtils.lerp(0.65, 1, visibility);
      const pulseBump = 1 + pulse.current * 0.2;
      // No hover-scale here on purpose — scaling on hover shifts the
      // raycasting bounds right at the pointer, which flickers hover
      // on/off and reads as a jumpy glitch. Hover is glow-only now.
      // A little squash/stretch tied to spin speed for a "juicy" toy feel.
      const speed = dragVelocity.current.length();
      const stretch = THREE.MathUtils.clamp(speed * 4, 0, 0.18);
      groupRef.current.scale.set(
        baseScale * pulseBump * (1 + stretch),
        baseScale * pulseBump * (1 - stretch),
        baseScale * pulseBump
      );

      const tiltFactor = draggingRef.current ? 0 : 1;
      groupRef.current.rotation.y =
        dragRotation.current.x + currentTilt.current.x * 0.35 * tiltFactor + idleSpin.current;
      groupRef.current.rotation.x =
        dragRotation.current.y - currentTilt.current.y * 0.2 * tiltFactor;
    }

    const targetGlow = (hovered ? 1.9 : 1.15) + pulse.current * 1.6;
    const spinSpeed = Math.min(1, dragVelocity.current.length() * 6);
    // The glow shifts toward white the faster it's spinning — visible,
    // fun feedback that the interaction is actually doing something.
    glowColor.current.set("#4fd6ff").lerp(
      new THREE.Color("#ffffff"),
      Math.max(spinSpeed, pulse.current)
    );

    for (const mat of [capMaterialRef.current, sideMaterialRef.current]) {
      if (!mat) continue;
      mat.opacity = visibility;
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity,
        targetGlow,
        0.12
      );
      mat.emissive.copy(glowColor.current);
    }

    if (outlineMaterialRef.current) {
      outlineMaterialRef.current.opacity = visibility;
      outlineMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        outlineMaterialRef.current.emissiveIntensity,
        (hovered ? 1.3 : 0.85) + pulse.current * 1.2,
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
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        draggingRef.current = true;
        dragVelocity.current.set(0, 0);
        lastPointer.current = { x: e.clientX, y: e.clientY };
        window.dispatchEvent(new CustomEvent("cursor-drag", { detail: true }));
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        pulse.current = 1;
      }}
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // A fun little "flick it hard" gesture.
        const kick = (Math.random() - 0.5) * 0.5;
        dragVelocity.current.set(0.4 + kick, kick * 0.4);
        pulse.current = 1;
      }}
    >
      <pointLight color="#4fd6ff" intensity={14} distance={16} position={[2.5, 2, 4]} />
      <pointLight color="#ffffff" intensity={5} distance={14} position={[-2.5, -1.5, 5]} />
      <Center>
        <Text3D
          font={FONT_URL}
          size={2.8}
          height={0.65}
          curveSegments={24}
          bevelEnabled
          bevelThickness={0.06}
          bevelSize={0.04}
          bevelSegments={8}
        >
          10
          {/* Glass-like physical material split across the two extrusion
              groups — lighter on the front/back caps, darker on the sides —
              for real dimensional shading instead of one flat color. */}
          <meshPhysicalMaterial
            ref={capMaterialRef}
            attach="material-0"
            color="#9595ec"
            emissive="#4fd6ff"
            emissiveIntensity={1.15}
            metalness={0.2}
            roughness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.06}
            transmission={0.3}
            thickness={1.2}
            ior={1.4}
            transparent
            opacity={0}
          />
          <meshPhysicalMaterial
            ref={sideMaterialRef}
            attach="material-1"
            color="#4b61e0"
            emissive="#4fd6ff"
            emissiveIntensity={1.15}
            metalness={0.2}
            roughness={0.15}
            clearcoat={1}
            clearcoatRoughness={0.1}
            transmission={0.15}
            thickness={1.2}
            ior={1.4}
            transparent
            opacity={0}
          />
        </Text3D>
      </Center>

      {/* Outer shell: a slightly enlarged duplicate rendered back-face-only
          (the classic inverted-hull outline trick) — a real solid-colored
          border instead of a thin edge line. */}
      <group scale={1.05}>
        <Center>
          <Text3D
            font={FONT_URL}
            size={2.8}
            height={0.65}
            curveSegments={24}
            bevelEnabled
            bevelThickness={0.06}
            bevelSize={0.04}
            bevelSegments={8}
          >
            10
            <meshStandardMaterial
              ref={outlineMaterialRef}
              color="#2a3a8f"
              emissive="#4b61e0"
              emissiveIntensity={0.85}
              roughness={0.4}
              side={THREE.BackSide}
              transparent
              opacity={0}
            />
          </Text3D>
        </Center>
      </group>
    </group>
  );
}

// Flat fallback in case the remote font fails to load — never crash the page.
function TenFlat() {
  const getVisibility = useTenVisibility();
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const visibility = getVisibility();
    if (groupRef.current) {
      groupRef.current.visible = visibility > 0.01;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.7, 1, visibility));
      groupRef.current.rotation.y += delta * 0.05;
    }
    if (materialRef.current) materialRef.current.opacity = visibility;
  });

  return (
    <group ref={groupRef} position={[0, 0, TEN_Z]}>
      <Text fontSize={4} color="#4fd6ff" anchorX="center" anchorY="middle">
        10
        <meshBasicMaterial ref={materialRef} color="#4fd6ff" transparent opacity={0} />
      </Text>
    </group>
  );
}

class TenBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <TenFlat />;
    return this.props.children;
  }
}

export default function TenText() {
  return (
    <TenBoundary>
      <Suspense fallback={null}>
        <Ten3D />
      </Suspense>
    </TenBoundary>
  );
}
