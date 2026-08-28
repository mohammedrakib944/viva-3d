"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useFont } from "@react-three/drei";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { FONT_URL, INTRO_END, TEN_Z, TUNNEL_LENGTH } from "./data";
import { makeStarTexture } from "./starTexture";
import { sampleTenShape } from "./particleTenShape";

const COUNT = 4200;
const CONVERGE_Z = TEN_Z;
// Roughly where the old "Initial Commit" core sat — the particle "10"
// occupies the same opening beat, just made of particles instead of a
// solid mesh.
const INTRO_Z = -1;
// How much of the intro window each individual particle's own detach
// transition spans — smaller reads as a sharper, more sudden peel-away;
// larger blurs the outside-in ordering into a softer overall dissolve.
const INTRO_PARTICLE_SPAN = 0.35;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function useTunnelGeometry() {
  return useMemo(() => {
    const base = new Float32Array(COUNT * 3);
    const converge = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    // Only a fraction of particles actually join the halo around the logo
    // — with all ~4200 crowding in, it turned into a thick cloud that
    // buried the logo and the flying character's orbit around it. The
    // rest simply stay put in their tunnel position (which, by the time
    // the camera settles at the end, is out of view) instead of piling on.
    const convergeParticipant = new Uint8Array(COUNT);

    const cyan = new THREE.Color("#4fd6ff");
    const white = new THREE.Color("#ffffff");

    for (let i = 0; i < COUNT; i++) {
      const s = i / COUNT;
      const angle = Math.random() * Math.PI * 2 + s * 14;

      // A defined spiral tube (most particles) plus a broader ambient
      // scatter (the rest) surrounding it — so the journey reads as a
      // dense galaxy filling the space, not a thin, sparse tube with
      // nothing around it.
      const isAmbient = Math.random() < 0.65;
      const radius = isAmbient ? 2 + Math.random() * 7.5 : 1.6 + Math.random() * 1.4;
      const z = isAmbient
        ? -Math.random() * TUNNEL_LENGTH
        : -s * TUNNEL_LENGTH - Math.random() * 2;

      base[i * 3] = Math.cos(angle) * radius;
      base[i * 3 + 1] = Math.sin(angle) * radius;
      base[i * 3 + 2] = z;

      // Converge into a spherical cloud that surrounds the logo from every
      // direction — top, bottom, front, back — rather than a flat ring
      // that only frames it from one side. Pushed further out (was
      // 2.6–6.2) so there's clear open space immediately around the model
      // itself rather than particles overlapping it.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const shellRadius = 4.5 + Math.random() * 4;
      converge[i * 3] = Math.sin(phi) * Math.cos(theta) * shellRadius;
      converge[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * shellRadius;
      converge[i * 3 + 2] = CONVERGE_Z + Math.cos(phi) * shellRadius;

      convergeParticipant[i] = Math.random() < 0.3 ? 1 : 0;

      const mixed = cyan.clone().lerp(white, Math.random() * 0.5);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    return { base, converge, colors, convergeParticipant };
  }, []);
}

function ParticlePoints({
  base,
  converge,
  colors,
  convergeParticipant,
  introShape,
  introThreshold,
  introExplosion,
}: {
  base: Float32Array;
  converge: Float32Array;
  colors: Float32Array;
  convergeParticipant: Uint8Array;
  introShape: Float32Array | null;
  introThreshold: Float32Array | null;
  introExplosion: Float32Array | null;
}) {
  const { progressRef } = useScroll();
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const starTexture = useMemo(() => makeStarTexture(), []);
  const positions = useMemo(() => new Float32Array(base), [base]);
  const prevIntroT = useRef(-1);
  const prevConvergeBlend = useRef(-1);

  useEffect(() => {
    return () => starTexture.dispose();
  }, [starTexture]);

  useFrame((state, delta) => {
    const p = progressRef.current.value;
    const convergeBlend = smoothstep(0.8, 1, p);
    // 0 at the very start (fully "10"-shaped), 1 once past INTRO_END
    // (fully dispersed into the tunnel) — stays pinned at 1 for the rest
    // of the scroll.
    const introT = introShape ? THREE.MathUtils.clamp(p / INTRO_END, 0, 1) : 1;

    // Only touch the buffer (and trigger a GPU re-upload) when something
    // actually changed. Re-uploading ~4k floats every single frame
    // regardless of state is expensive enough to cause frame stutter and,
    // on weaker/software GPUs, WebGL context loss.
    const changed =
      Math.abs(introT - prevIntroT.current) > 0.0005 ||
      Math.abs(convergeBlend - prevConvergeBlend.current) > 0.0005;

    if (changed) {
      const geom = pointsRef.current?.geometry;
      if (geom) {
        const attr = geom.getAttribute("position") as THREE.BufferAttribute;
        const settledInTunnel = introT >= 1 && convergeBlend <= 0.0005;

        if (settledInTunnel) {
          (attr.array as Float32Array).set(base);
        } else {
          for (let i = 0; i < COUNT; i++) {
            const ix = i * 3;

            let x = base[ix];
            let y = base[ix + 1];
            let z = base[ix + 2];

            if (introShape && introThreshold && introExplosion && introT < 1) {
              const start = introThreshold[i];
              const end = Math.min(1, start + INTRO_PARTICLE_SPAN);
              const local = smoothstep(start, end, introT);

              // Quadratic Bezier through a random outward "explosion"
              // control point, instead of a straight line from the "10"
              // to its tunnel spot — a direct lerp visibly contracts
              // toward the tunnel's circular cross section, which reads
              // as particles collapsing to a center rather than
              // scattering into open space.
              const inv = 1 - local;
              const w0 = inv * inv;
              const w1 = 2 * inv * local;
              const w2 = local * local;
              const p1x = introShape[ix] + introExplosion[ix];
              const p1y = introShape[ix + 1] + introExplosion[ix + 1];
              const p1z = introShape[ix + 2] + introExplosion[ix + 2];

              x = w0 * introShape[ix] + w1 * p1x + w2 * x;
              y = w0 * introShape[ix + 1] + w1 * p1y + w2 * y;
              z = w0 * introShape[ix + 2] + w1 * p1z + w2 * z;
            }

            if (convergeBlend > 0 && convergeParticipant[i]) {
              x = THREE.MathUtils.lerp(x, converge[ix], convergeBlend);
              y = THREE.MathUtils.lerp(y, converge[ix + 1], convergeBlend);
              z = THREE.MathUtils.lerp(z, converge[ix + 2], convergeBlend);
            }

            attr.array[ix] = x;
            attr.array[ix + 1] = y;
            attr.array[ix + 2] = z;
          }
        }
        attr.needsUpdate = true;
      }
      prevIntroT.current = introT;
      prevConvergeBlend.current = convergeBlend;
    }

    if (groupRef.current) {
      if (introT < 1) {
        // Hard reset, not just "stop increasing" — this was a free-running
        // accumulator with no connection to scroll position, so scrolling
        // forward into the tunnel (where it spins) and then back up to the
        // very start left the text stuck at whatever angle it had reached,
        // instead of coming back upright.
        groupRef.current.rotation.z = 0;
      } else {
        // Slow drift once fully dispersed into the tunnel, speeding into a
        // gentle halo swirl once converged around the logo.
        const spinSpeed = THREE.MathUtils.lerp(0.02, 0.06, convergeBlend);
        groupRef.current.rotation.z += delta * spinSpeed;
      }
    }

    if (materialRef.current) {
      // Bigger points specifically while the intro text is still mostly
      // intact — with the same particle count spread across more
      // characters than the old plain "10", larger points fill the gaps
      // between them so the text actually reads instead of looking sparse.
      // Eases back down to the normal tunnel size as it disperses, then
      // smaller and softer still around the logo — a delicate ambient
      // accent there rather than a dense, view-blocking cloud.
      const introSizeFactor = introShape ? 1 - smoothstep(0, 1, introT) : 0;
      const tunnelSize = THREE.MathUtils.lerp(0.24, 0.34, introSizeFactor);
      materialRef.current.size = THREE.MathUtils.lerp(tunnelSize, 0.14, convergeBlend);
      materialRef.current.opacity = THREE.MathUtils.lerp(0.85, 0.55, convergeBlend);
    }
  });

  return (
    <group ref={groupRef}>
      {/* The particle positions are mutated directly in the buffer every
          frame, but the geometry's bounding sphere is only ever computed
          once — from wherever the particles started (the small "10 years"
          text). Three.js then frustum-culls the whole points object once
          the camera moves away from that stale bounding region, even
          though the actual (moved) particles are still in view — which is
          exactly why the tunnel looked empty after the intro. Disabling
          automatic culling for this object fixes it. */}
      <points ref={pointsRef} frustumCulled={false}>
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
          ref={materialRef}
          map={starTexture}
          alphaTest={0.05}
          size={0.24}
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

// Loads the shared font and scatters the particles' opening positions
// across a "10" shape built from it. If this (network font fetch, surface
// sampling) ever fails, the boundary below falls back to the tunnel
// without the intro formation — never crashes the scene over it.
function ParticleFieldWithIntro() {
  const { base, converge, colors, convergeParticipant } = useTunnelGeometry();
  const font = useFont(FONT_URL);

  const {
    positions: introShape,
    detachThreshold: introThreshold,
    explosionOffset,
  } = useMemo(() => sampleTenShape(font, COUNT), [font]);

  const offsetIntroShape = useMemo(() => {
    const shifted = new Float32Array(introShape.length);
    for (let i = 0; i < COUNT; i++) {
      shifted[i * 3] = introShape[i * 3];
      shifted[i * 3 + 1] = introShape[i * 3 + 1];
      shifted[i * 3 + 2] = introShape[i * 3 + 2] + INTRO_Z;
    }
    return shifted;
  }, [introShape]);

  return (
    <ParticlePoints
      base={base}
      converge={converge}
      colors={colors}
      convergeParticipant={convergeParticipant}
      introShape={offsetIntroShape}
      introThreshold={introThreshold}
      introExplosion={explosionOffset}
    />
  );
}

function ParticleFieldBasic() {
  const { base, converge, colors, convergeParticipant } = useTunnelGeometry();
  return (
    <ParticlePoints
      base={base}
      converge={converge}
      colors={colors}
      convergeParticipant={convergeParticipant}
      introShape={null}
      introThreshold={null}
      introExplosion={null}
    />
  );
}

class ParticleBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(
      "Particle intro shape failed to build — falling back to the plain tunnel.",
      error
    );
  }
  render() {
    if (this.state.failed) return <ParticleFieldBasic />;
    return this.props.children;
  }
}

export default function ParticleUniverse() {
  return (
    <ParticleBoundary>
      {/* While the font is still loading, render nothing rather than a
          plain-tunnel stand-in — swapping a fully different random particle
          layout in right as it resolves would read as a visible pop. The
          boot sequence's own loading screen covers this window in practice. */}
      <Suspense fallback={null}>
        <ParticleFieldWithIntro />
      </Suspense>
    </ParticleBoundary>
  );
}
