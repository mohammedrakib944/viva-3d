"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";
import { makeStarTexture } from "./starTexture";
import { TEN_Z } from "./data";

const GLB_URL = "/3d-models/hero-1.optimized.glb";
const TARGET_HEIGHT = 2.4;
const TRAIL_COUNT = 36;
// A trail point is only recorded once the model has moved at least this far
// from the last one, rather than every frame — otherwise, at normal flight
// speed, dozens of points bunch up inside the model's own silhouette and
// look like sparkles passing through its body instead of a clean streak
// trailing behind it.
const TRAIL_MIN_SPACING = 0.15;

// Three's physically-correct lighting falls off as intensity / distance², so
// these need to be large to read as "lit" at all — a value like the old
// legacy-lighting default of ~10 is nearly invisible at this range.
const KEY_LIGHT_INTENSITY = 55;
const RIM_LIGHT_INTENSITY = 32;

// Tunnel-flight -> orbit hand-off, keyed to scroll progress. This ramps all
// the way to 1 (rather than stopping partway, e.g. at 0.9) so the character
// keeps easing continuously for as long as the page can still scroll —
// otherwise it fully "arrives" while there's still scroll room left, and
// sits frozen (no visible response to further scrolling) until the wheel
// takes over at ORBIT_WHEEL_ENGAGE_PROGRESS.
const ORBIT_BLEND_START = 0.78;
const ORBIT_BLEND_END = 0.98;

// The orbit itself, once engaged: an inclined circle around the "10",
// steered by the scroll wheel rather than the tunnel path.
const ORBIT_RADIUS = 3.6;
const ORBIT_TILT = 0.4;
// After 1 second of easing, this fraction of the gap to the wheel's target
// angle still remains — smaller is snappier, closer to 1 is slower/statelier.
const ORBIT_EASE_BASE = 0.2;
const ORBIT_WHEEL_SENSITIVITY = 0.0026;
const ORBIT_TURN_DURATION = 1.2;
// Scroll progress genuinely hard-clamps to exactly 1 once the page is fully
// scrolled (see ScrollProvider), so this can require the true max exactly —
// matching ORBIT_BLEND_END above (which reaches 1 by the same point) rather
// than an earlier approximation, so the position-blend finishes fully
// settling before wheel control takes over, instead of the two overlapping.
const ORBIT_WHEEL_ENGAGE_PROGRESS = 1;

// Facing direction that keeps the model nose-first along its direction of
// travel around the orbit circle — flipping `direction` flips this by
// exactly π, which is what the U-turn animation sweeps through below.
// (Paired with the negated Z term in orbitFlatZ below — together they make
// the orbit sweep anti-clockwise from its right-side entry point, which
// reads as the natural continuation of arriving from that side, rather than
// clockwise back over where it just came from.)
function orbitYaw(direction: 1 | -1, angle: number) {
  return direction === 1 ? Math.PI + angle : angle;
}

function Hero() {
  const { progressRef } = useScroll();
  const groupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);
  const rimLightRef = useRef<THREE.PointLight>(null);
  const trailPointsRef = useRef<THREE.Points>(null);

  const { scene } = useGLTF(GLB_URL);

  // The source asset is an arbitrary export scale/pivot — normalize it to a
  // known height, centered on its own origin, so the flight-path math below
  // can treat it as a unit-scale object.
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

  // Comet-style trail: a short ring buffer of past positions rendered as
  // dimming star sprites, so the flight through the tunnel leaves a
  // streak behind it instead of gliding through silently.
  const starTexture = useMemo(() => makeStarTexture(), []);
  useEffect(() => () => starTexture.dispose(), [starTexture]);

  const trailGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3)
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3)
    );
    return geom;
  }, []);
  useEffect(() => () => trailGeometry.dispose(), [trailGeometry]);

  const trailHistory = useMemo(
    () => Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector3()),
    []
  );
  const trailColor = useMemo(() => new THREE.Color("#4fd6ff"), []);

  // Orbit state: a wheel-driven target angle, the eased/rendered angle that
  // actually positions the model, which way it's currently traveling around
  // the circle, and — while reversing — an in-progress U-turn animation.
  const orbitAngleTargetRef = useRef(0);
  const orbitAngleRef = useRef(0);
  const orbitDirectionRef = useRef<1 | -1>(1);
  const orbitTurnRef = useRef({ active: false, progress: 0, startYaw: 0 });

  // Which way through the tunnel it's currently facing: away from the
  // camera while advancing (the established convention), front-on while
  // retreating — updated only on a real scroll direction, not on the tiny
  // per-frame noise around zero while scroll is essentially still, so it
  // doesn't flicker.
  const prevProgressRef = useRef<number | null>(null);
  const tunnelFacingRef = useRef<1 | -1>(1);

  // Once fully scrolled to the bottom, the scroll wheel steers the orbit
  // instead of the page — captured on the window in the capture phase so it
  // runs before Lenis's own (bubble-phase) wheel listener. Lenis skips any
  // wheel event whose path includes an element carrying
  // `data-lenis-prevent-wheel` (checked live when it handles the event), which
  // is how control is handed back and forth: while the orbit still has ground
  // to cover, that attribute is set and the event is consumed here; only once
  // it's fully unwound back to its starting side is scrolling up left
  // untouched, so Lenis resumes retreating back up through the tunnel as
  // normal.
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      const atEnd = progressRef.current.value >= ORBIT_WHEEL_ENGAGE_PROGRESS;
      const stillOrbiting =
        orbitAngleTargetRef.current > 0.0005 ||
        orbitAngleRef.current > 0.0005 ||
        orbitTurnRef.current.active;
      const intercept = atEnd && (event.deltaY > 0 || stillOrbiting);

      if (intercept) {
        document.body.setAttribute("data-lenis-prevent-wheel", "");
        if (event.cancelable) event.preventDefault();
        orbitAngleTargetRef.current = Math.max(
          0,
          orbitAngleTargetRef.current + event.deltaY * ORBIT_WHEEL_SENSITIVITY
        );
      } else {
        document.body.removeAttribute("data-lenis-prevent-wheel");
      }
    }
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      document.body.removeAttribute("data-lenis-prevent-wheel");
    };
  }, [progressRef]);

  useFrame((state, delta) => {
    const p = progressRef.current.value;
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    const pVelocity = prevProgressRef.current === null ? 0 : p - prevProgressRef.current;
    prevProgressRef.current = p;
    if (pVelocity > 1e-6) tunnelFacingRef.current = 1;
    else if (pVelocity < -1e-6) tunnelFacingRef.current = -1;

    // Simple vertical bob plus forward travel through the tunnel — no
    // lateral (X-axis) drift, so the flight path stays calm rather than busy.
    const camZ = state.camera.position.z;
    const followZ = camZ - 6 - Math.sin(t * 0.22) * 3.4;
    const weaveY = Math.cos(t * 0.26) * 1.4 + Math.sin(t * 1.2) * 0.2;

    // Near the end of the scroll, peel off the tunnel path into a standing,
    // inclined orbit around the "10" — arriving at one side of it rather
    // than fading away.
    const orbitBlend = THREE.MathUtils.smoothstep(
      p,
      ORBIT_BLEND_START,
      ORBIT_BLEND_END
    );

    // Ease the rendered angle toward the wheel's target, except mid-turn,
    // where position holds still while the model visibly banks around to
    // face the other way — a flying object can't just reverse in place.
    const target = orbitAngleTargetRef.current;
    const current = orbitAngleRef.current;
    const gap = target - current;
    const desiredDir: 1 | -1 =
      Math.abs(gap) < 0.02 ? orbitDirectionRef.current : gap > 0 ? 1 : -1;

    if (
      !orbitTurnRef.current.active &&
      desiredDir !== orbitDirectionRef.current
    ) {
      orbitTurnRef.current.active = true;
      orbitTurnRef.current.progress = 0;
      orbitTurnRef.current.startYaw = orbitYaw(
        orbitDirectionRef.current,
        current
      );
    }

    let yawTarget: number;
    if (orbitTurnRef.current.active) {
      orbitTurnRef.current.progress = Math.min(
        1,
        orbitTurnRef.current.progress + delta / ORBIT_TURN_DURATION
      );
      const turnT = orbitTurnRef.current.progress;
      const eased = THREE.MathUtils.smoothstep(turnT, 0, 1);
      yawTarget = orbitTurnRef.current.startYaw + Math.PI * eased;
      if (turnT >= 1) {
        orbitTurnRef.current.active = false;
        orbitDirectionRef.current = desiredDir;
      }
    } else {
      const easing = 1 - Math.pow(ORBIT_EASE_BASE, delta);
      const eased = THREE.MathUtils.lerp(current, target, easing);
      // Exponential decay approaches the target but never quite reaches it —
      // snap once close enough so it actually settles at exactly 0 (letting
      // control release back to the page scroll) instead of lingering just
      // above the "still orbiting" threshold for several more seconds.
      orbitAngleRef.current =
        Math.abs(target - eased) < 0.01 ? target : eased;
      yawTarget = orbitYaw(orbitDirectionRef.current, orbitAngleRef.current);
    }

    const a = orbitAngleRef.current;
    const orbitFlatX = Math.cos(a) * ORBIT_RADIUS;
    // Negated so the orbit sweeps anti-clockwise from its right-side entry
    // point (see orbitYaw above, which is derived to match this sign).
    const orbitFlatZ = -Math.sin(a) * ORBIT_RADIUS;
    const orbitY = 0.3 + orbitFlatZ * Math.sin(ORBIT_TILT) * 0.5;
    const orbitZ = TEN_Z + orbitFlatZ * Math.cos(ORBIT_TILT);

    const targetX = THREE.MathUtils.lerp(0, orbitFlatX, orbitBlend);
    const targetY = THREE.MathUtils.lerp(weaveY, orbitY, orbitBlend);
    const targetZ = THREE.MathUtils.lerp(followZ, orbitZ, orbitBlend);
    groupRef.current.position.set(targetX, targetY, targetZ);

    // Yaw blends from the tunnel's forward-facing — away from the camera
    // while advancing, front-on while retreating, so scrolling back up
    // shows its face rather than continuing to fly away — into the orbit's
    // tangent-facing direction, banking into a turn whenever the wheel
    // reverses it — it never simply flies backward.
    const tunnelYaw = tunnelFacingRef.current === 1 ? Math.PI : 0;
    const smoothing = 1 - Math.pow(0.0005, delta);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      THREE.MathUtils.lerp(tunnelYaw, yawTarget, orbitBlend),
      smoothing
    );
    // A bank into the U-turn, easing back to level once it's done.
    const turnRoll = orbitTurnRef.current.active
      ? Math.sin(orbitTurnRef.current.progress * Math.PI) * 0.5
      : 0;
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      turnRoll,
      smoothing
    );

    // Fade in once past the boot/initial-commit scene, then stay visible —
    // including through the "10" climax, where it now orbits — rather than
    // fading out and disappearing.
    const visibility = THREE.MathUtils.smoothstep(p, 0.06, 0.14);
    groupRef.current.visible = visibility > 0.02;
    groupRef.current.scale.setScalar(visibility);

    // The tunnel's ambient light is deliberately dim — carry the hero's own
    // key + rim light with it so the PBR material actually reads instead of
    // rendering near-black in the empty stretches between set pieces.
    if (keyLightRef.current)
      keyLightRef.current.intensity = KEY_LIGHT_INTENSITY * visibility;
    if (rimLightRef.current)
      rimLightRef.current.intensity = RIM_LIGHT_INTENSITY * visibility;

    // Only record a new trail point once it's moved far enough from the
    // last one (see TRAIL_MIN_SPACING above); otherwise just keep the head
    // glued to the model's current position.
    const head = trailHistory[0];
    if (
      head.distanceToSquared(groupRef.current.position) >
      TRAIL_MIN_SPACING * TRAIL_MIN_SPACING
    ) {
      for (let i = trailHistory.length - 1; i > 0; i--) {
        trailHistory[i].copy(trailHistory[i - 1]);
      }
    }
    trailHistory[0].copy(groupRef.current.position);

    const posAttr = trailGeometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const colorAttr = trailGeometry.getAttribute(
      "color"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const point = trailHistory[i];
      posAttr.setXYZ(i, point.x, point.y, point.z);
      const fade = visibility * (1 - i / TRAIL_COUNT);
      colorAttr.setXYZ(
        i,
        trailColor.r * fade,
        trailColor.g * fade,
        trailColor.b * fade
      );
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    if (trailPointsRef.current) trailPointsRef.current.visible = visibility > 0.02;
  });

  return (
    <>
      <group ref={groupRef}>
        <pointLight
          ref={keyLightRef}
          color="#4fd6ff"
          intensity={KEY_LIGHT_INTENSITY}
          distance={10}
          position={[1.2, 1, 1.5]}
        />
        <pointLight
          ref={rimLightRef}
          color="#ffffff"
          intensity={RIM_LIGHT_INTENSITY}
          distance={9}
          position={[-1.2, -0.6, -1.5]}
        />
        <primitive object={model} />
      </group>

      <points ref={trailPointsRef} geometry={trailGeometry}>
        <pointsMaterial
          map={starTexture}
          alphaTest={0.05}
          size={0.22}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </>
  );
}

class HeroBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("FlyingCharacter failed to load — hiding it.", error);
  }
  render() {
    // If the model fails to load for any reason, just don't render it —
    // never take the rest of the scene down with it.
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function FlyingCharacter() {
  return (
    <HeroBoundary>
      <Suspense fallback={null}>
        <Hero />
      </Suspense>
    </HeroBoundary>
  );
}
