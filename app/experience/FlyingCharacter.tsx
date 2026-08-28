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

// Tunnel-flight -> orbit hand-off, keyed to scroll progress. The blend
// finishes (ORBIT_BLEND_END) at exactly the same progress where the wheel
// takes over (ORBIT_WHEEL_ENGAGE_PROGRESS) — both point at the same shared
// constant below, on purpose. Any gap between the two creates a dead zone
// where the character has fully "arrived" but the wheel hasn't engaged yet,
// so continuing to scroll produces zero visible motion until you cross that
// gap. Requiring literal floating-point equality to 1 for the engage
// threshold caused exactly this, intermittently: real scroll momentum and
// overscroll bounce can leave the computed progress hovering just under 1
// instead of landing on it precisely, which varies with frame timing — so it
// showed up as inconsistent, sometimes-stuck behavior, worse in production
// where that timing is less predictable than local testing. A small margin
// below the true max fixes both problems at once.
const ORBIT_SETTLE_PROGRESS = 0.99;
const ORBIT_BLEND_START = 0.78;
const ORBIT_BLEND_END = ORBIT_SETTLE_PROGRESS;

// The orbit itself, once engaged: an inclined circle around the "10",
// steered by the scroll wheel rather than the tunnel path.
const ORBIT_RADIUS = 3.6;
const ORBIT_TILT = 0.4;
// Speed (rad/sec) the rendered angle closes the gap to the wheel's target
// at, scaled by how big the gap currently is — but clamped between a floor
// and a ceiling, never a smooth percentage-of-remaining-gap decay (that
// always decelerates all the way to zero near the target, and the larger
// the gap, the longer that slow-down tail takes to become imperceptible —
// which is what made a fast scroll burst glide to a stop for *longer*
// instead of landing faster). A single small wheel-tick's worth of motion
// moves at the floor speed — slow enough to read as a smooth, continuous
// glide instead of resolving in one frame (which is what showed up as
// "jumping": each discrete wheel tick snapping to its new position almost
// instantly, then holding until the next one). A large gap (e.g. landing
// back at the entry point after several rounds) moves at the ceiling speed
// instead of inheriting that same slow pace. Neither end decays toward
// zero — once the remaining gap is smaller than one frame's step at
// whatever speed is in effect, it snaps directly to the target, so it
// always stops cleanly rather than gliding in. Verified by simulation
// (not just derived by hand, since the floor clamp interacting with the
// gap-proportional scaling is easy to get subtly wrong): at this floor, a
// single wheel-tick's glide takes ~250ms and even landing after several
// full laps takes well under a second — lowering the floor further keeps
// smoothing out single-tick input at the cost of extending that same total
// return time (they're coupled: any smooth final approach costs roughly
// its own glide time regardless of how far the trip started).
const ORBIT_MIN_ANGULAR_SPEED = 1;
const ORBIT_MAX_ANGULAR_SPEED = 18;
const ORBIT_CATCHUP_RATE = 6;
const ORBIT_WHEEL_SENSITIVITY = 0.0026;
// Caps how far the wheel-driven target can get AHEAD of the actually
// rendered angle, as a sanity bound against an unbounded runaway lead from
// a very long forward-scrolling burst. Deliberately one-directional: only
// the forward/ahead side is capped. Capping the other side too (i.e. how
// far behind the target can get while reversing) throttled every reversal
// to whatever pace the rendered angle happened to be catching up at,
// regardless of how much further you scrolled — reversing back toward the
// entry point (floored at 0 below) is always fully, immediately responsive
// to input instead.
const ORBIT_MAX_LEAD = Math.PI;
const ORBIT_WHEEL_ENGAGE_PROGRESS = ORBIT_SETTLE_PROGRESS;
// How far it banks while closing a gap, leveling out once settled.
const ORBIT_MAX_ROLL = 0.5;

// Frame-to-frame delta is clamped to this before driving any per-frame
// integration (easing, rotation smoothing) below — a real stall (a dropped
// frame, a GC pause, a tab that was briefly backgrounded) otherwise
// produces one abnormally large delta on the frame right after, which snaps
// whatever was mid-transition straight to its target instead of continuing
// to ease — reading as a freeze immediately followed by a pop rather than a
// smooth, if momentarily slow, motion.
const MAX_FRAME_DELTA = 0.05;

// Facing direction that keeps the model nose-first along its direction of
// travel around the orbit circle — flipping `direction` flips this by
// exactly π. Reversing direction is handled by simply letting this jump by
// π and leaning on the rotation-smoothing already applied to rotation.y
// below to swing it around — quickly, but never by freezing position to do
// it. (Paired with the negated Z term in orbitFlatZ below — together they
// make the orbit sweep anti-clockwise from its right-side entry point,
// which reads as the natural continuation of arriving from that side,
// rather than clockwise back over where it just came from.)
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
  // actually positions the model (never frozen — always easing toward the
  // target), and which way it's currently traveling around the circle.
  const orbitAngleTargetRef = useRef(0);
  const orbitAngleRef = useRef(0);
  const orbitDirectionRef = useRef<1 | -1>(1);

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
        orbitAngleTargetRef.current > 0.0005 || orbitAngleRef.current > 0.0005;
      const intercept = atEnd && (event.deltaY > 0 || stillOrbiting);

      if (intercept) {
        document.body.setAttribute("data-lenis-prevent-wheel", "");
        if (event.cancelable) event.preventDefault();
        const rawTarget =
          orbitAngleTargetRef.current + event.deltaY * ORBIT_WHEEL_SENSITIVITY;
        const current = orbitAngleRef.current;
        orbitAngleTargetRef.current = Math.max(
          0,
          Math.min(rawTarget, current + ORBIT_MAX_LEAD)
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

  useFrame((state, rawDelta) => {
    const p = progressRef.current.value;
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);

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

    // Track the wheel's target continuously — position is never frozen,
    // including through a direction reversal, so there's no window where
    // scrolling appears to do nothing.
    const target = orbitAngleTargetRef.current;
    const current = orbitAngleRef.current;
    const gap = target - current;
    // A small dead zone so the facing direction doesn't flicker when it's
    // essentially stationary (gap ~0), rather than tracking rounding noise.
    if (Math.abs(gap) > 0.02) {
      orbitDirectionRef.current = gap > 0 ? 1 : -1;
    }

    // Move toward the target at a speed scaled to the gap (clamped between
    // a floor and ceiling) and stop the instant it arrives — see
    // ORBIT_MIN_ANGULAR_SPEED above for why this isn't a plain constant
    // speed or a percentage-of-remaining-gap decay.
    const speed = THREE.MathUtils.clamp(
      Math.abs(gap) * ORBIT_CATCHUP_RATE,
      ORBIT_MIN_ANGULAR_SPEED,
      ORBIT_MAX_ANGULAR_SPEED
    );
    const maxStep = speed * delta;
    const nextAngle = Math.abs(gap) <= maxStep ? target : current + Math.sign(gap) * maxStep;
    orbitAngleRef.current = nextAngle;

    // Keep the working angle wrapped to a small range on every frame,
    // rather than letting it grow without bound the longer it orbits. A
    // multiple of 2π is a complete visual no-op for position (cos/sin are
    // exactly periodic) — but critically, whenever it's wrapped here, the
    // rotation this angle has already been driving is nudged by the exact
    // same amount in the same instant, so the two numbers never fall out of
    // sync (leaving them out of sync is what used to make it visibly spin
    // in place: the rotation-smoothing below has no concept of periodicity,
    // so a stale 2π-multiple offset just reads as a real target it needs to
    // spin all the way around to reach). Doing it continuously also means
    // reversing never has more than about one lap to retrace, no matter how
    // long it's been orbiting.
    while (Math.abs(orbitAngleRef.current) > Math.PI * 2) {
      const wrap = Math.sign(orbitAngleRef.current) * Math.PI * 2;
      orbitAngleRef.current -= wrap;
      orbitAngleTargetRef.current -= wrap;
      groupRef.current.rotation.y -= wrap;
    }

    const yawTarget = orbitYaw(orbitDirectionRef.current, orbitAngleRef.current);

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
    // tangent-facing direction. Reversing direction swings this by exactly
    // π; the smoothing below turns that into a quick swing rather than an
    // instant flip, without ever pausing the model's actual movement.
    const tunnelYaw = tunnelFacingRef.current === 1 ? Math.PI : 0;
    const smoothing = 1 - Math.pow(0.0005, delta);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      THREE.MathUtils.lerp(tunnelYaw, yawTarget, orbitBlend),
      smoothing
    );
    // Banks toward whichever way it's currently closing the gap, leveling
    // out once there's nothing left to close — the smoothing below turns
    // this on/off target into a quick lean in and out rather than a snap.
    const turnRoll =
      Math.abs(gap) > 0.01 ? -Math.sign(gap) * ORBIT_MAX_ROLL * orbitBlend : 0;
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
