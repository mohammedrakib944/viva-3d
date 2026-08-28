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

const HERO_URL = "/3d-models/hero-1.optimized.glb";
const FRIEND_URL = "/3d-models/hero-2.optimized.glb";
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
// Cool cyan/white while facing away (matches the tunnel's own sci-fi
// palette), blended to a warm, skin-flattering tone whenever a character
// is actually showing its front — see the `warmth` calculation below for
// exactly when that is.
const KEY_LIGHT_COOL_COLOR = new THREE.Color("#4fd6ff");
const KEY_LIGHT_WARM_COLOR = new THREE.Color("#ffb37a");
const RIM_LIGHT_COOL_COLOR = new THREE.Color("#ffffff");
const RIM_LIGHT_WARM_COLOR = new THREE.Color("#ffe0b8");

// The second character flies as hero's companion: same shared orbit/tunnel
// state, not a second copy of it, but mirrored rather than following —
// it flies to the side (with real breathing room from hero) through the
// tunnel, then enters the orbit from the opposite (left) side and circles
// the logo the opposite way (clockwise, while hero goes anti-clockwise) —
// see the friendAngle/friendDirection math below for how "opposite side,
// opposite rotation" falls out of one sign flip on the shared angle.
// Equal-magnitude, opposite-sign lateral offsets — hero to the right of
// center, friend to the left — so the two carry the same visual weight
// during tunnel flight instead of one reading as centered/primary and the
// other as an offset sidekick. Total separation between them is unchanged
// from before (still 2.2 apart), just centered rather than one-sided.
const HERO_LATERAL_OFFSET = 1.1;
const FRIEND_LATERAL_OFFSET = -1.1;
const FRIEND_Z_OFFSET = 1.6; // further separated in tunnel depth too
const FRIEND_TIME_OFFSET = 0.9; // phase-shifts its bob rhythm so the two don't move in perfect lockstep

// The opening entrance (and, symmetrically, what happens if you scroll back
// past it): rather than scaling up from nothing / down to nothing, each
// character starts genuinely far away — well off to its own side and much
// deeper in the tunnel than its normal flight position — at full, unscaled
// size the whole time. Getting smaller/larger is just real perspective on a
// real distance, not a scale trick, so flying in reads as hero arriving
// from the right and the friend from the left, out of the depth of the
// tunnel, rather than fading/popping into existence. Reversing through this
// same scroll range (e.g. scrolling back to the very start) sends them
// back out the same way they came.
const ENTRANCE_PROGRESS_END = 0.14;
const ENTRANCE_EXTRA_LATERAL = 3;
const ENTRANCE_EXTRA_DEPTH = 4;

// The orbit itself, once engaged: an inclined circle around the "10",
// steered by the scroll wheel rather than the tunnel path.
const ORBIT_RADIUS = 3.6;
const ORBIT_TILT = 0.4;

// A mirrored orbit (friendAngle = π - baseAngle, see below) makes the two
// characters' X positions exact negatives of each other at every instant
// (cos(π - a) = -cos(a)) — so whenever hero's X crosses zero (twice a lap,
// including the point closest to the camera), friend's X crosses zero at
// that exact same moment too. A radius difference keeps them apart there,
// at the (same-tilt, both circling flat on the same plane) cost of a
// visibly bigger circle for the friend. Brought in twice now, from an
// original 6.0 (~2.3 units worst-case separation, per simulation) to 5.0
// (~1.3) to this — ~0.75 units worst-case at the two closest-approach
// points each lap. That's getting close to where the original same-radius
// version overlapped outright (~0.66 at radius 4.3), so I'd treat this as
// close to the floor for "radius alone" before the crossing starts reading
// as a real collision again rather than a close pass.
const FRIEND_ORBIT_RADIUS = 4.4;
const FRIEND_ORBIT_TILT = ORBIT_TILT;

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
// Widened from 0.78 — starting the blend that much closer to
// ORBIT_BLEND_END compressed the whole hand-off into a short scroll
// window, so it visibly finished after very little scrolling. Starting it
// earlier spreads the same transition over more scroll distance without
// changing where it must finish (ORBIT_BLEND_END is intentionally still
// tied to ORBIT_SETTLE_PROGRESS — see the wheel hand-off note above).
const ORBIT_BLEND_START = 0.6;
const ORBIT_BLEND_END = ORBIT_SETTLE_PROGRESS;

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

// Facing direction that keeps a character nose-first along its direction of
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

type Pose = { x: number; y: number; z: number; rotY: number; rotZ: number };

// Pure position/facing formula for one character at one moment — called
// once per character per frame with its own angle and direction (see
// friendAngle/friendDirection in FlyingCharacter below for how the friend's
// mirrored entry/rotation falls out of this) and spatial offsets, so hero
// and its friend share every bit of the underlying flight math without
// either duplicating or hard-coding the other's position.
function computePose(params: {
  camZ: number;
  t: number;
  orbitBlend: number;
  angle: number;
  direction: 1 | -1;
  tunnelFacing: 1 | -1;
  turnRoll: number;
  lateralOffset: number;
  zOffset: number;
  timeOffset: number;
  orbitRadius: number;
  orbitTilt: number;
}): Pose {
  const {
    camZ,
    t,
    orbitBlend,
    angle,
    direction,
    tunnelFacing,
    turnRoll,
    lateralOffset,
    zOffset,
    timeOffset,
    orbitRadius,
    orbitTilt,
  } = params;
  const bt = t - timeOffset;

  // Simple vertical bob plus forward travel through the tunnel — no
  // lateral (X-axis) drift beyond a fixed per-character offset, so the
  // flight path stays calm rather than busy.
  const followZ = camZ - 6 - Math.sin(bt * 0.22) * 3.4 + zOffset;
  const weaveY = Math.cos(bt * 0.26) * 1.4 + Math.sin(bt * 1.2) * 0.2;

  const orbitFlatX = Math.cos(angle) * orbitRadius;
  // Negated so the orbit sweeps anti-clockwise from its right-side entry
  // point (see orbitYaw above, which is derived to match this sign).
  const orbitFlatZ = -Math.sin(angle) * orbitRadius;
  const orbitY = 0.3 + orbitFlatZ * Math.sin(orbitTilt) * 0.5;
  const orbitZ = TEN_Z + orbitFlatZ * Math.cos(orbitTilt);

  const x = THREE.MathUtils.lerp(lateralOffset, orbitFlatX, orbitBlend);
  const y = THREE.MathUtils.lerp(weaveY, orbitY, orbitBlend);
  const z = THREE.MathUtils.lerp(followZ, orbitZ, orbitBlend);

  // Yaw blends from the tunnel's forward-facing — away from the camera
  // while advancing, front-on while retreating, so scrolling back up shows
  // its face rather than continuing to fly away — into the orbit's
  // tangent-facing direction. Reversing direction swings this by exactly π;
  // the smoothing applied where this is used turns that into a quick swing
  // rather than an instant flip, without ever pausing the model's actual
  // movement.
  const tunnelYaw = tunnelFacing === 1 ? Math.PI : 0;
  const yawTarget = orbitYaw(direction, angle);
  const rotY = THREE.MathUtils.lerp(tunnelYaw, yawTarget, orbitBlend);

  return { x, y, z, rotY, rotZ: turnRoll };
}

function createTrailAssets() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3)
  );
  const history = Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector3());
  const color = new THREE.Color("#4fd6ff");
  return { geometry, history, color };
}

function HeroModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  // The source asset is an arbitrary export scale/pivot — normalize it to a
  // known height, centered on its own origin, so the flight-path math
  // above can treat it as a unit-scale object.
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

  return <primitive object={model} />;
}

class HeroBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("A flying character failed to load — hiding it.", error);
  }
  render() {
    // If the model fails to load for any reason, just don't render it —
    // never take the rest of the scene down with it.
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function FlyingCharacter() {
  const { progressRef } = useScroll();

  // Each character's own refs/geometry, declared directly (not routed
  // through a shared bundle or a custom hook that returns one) so every
  // ref stays a plain, direct useRef() binding the hooks linter can trace.
  const heroGroupRef = useRef<THREE.Group>(null);
  const heroKeyLightRef = useRef<THREE.PointLight>(null);
  const heroRimLightRef = useRef<THREE.PointLight>(null);
  const heroTrail = useMemo(() => createTrailAssets(), []);
  useEffect(() => () => heroTrail.geometry.dispose(), [heroTrail]);
  const heroStarTexture = useMemo(() => makeStarTexture(), []);
  useEffect(() => () => heroStarTexture.dispose(), [heroStarTexture]);

  const friendGroupRef = useRef<THREE.Group>(null);
  const friendKeyLightRef = useRef<THREE.PointLight>(null);
  const friendRimLightRef = useRef<THREE.PointLight>(null);
  const friendTrail = useMemo(() => createTrailAssets(), []);
  useEffect(() => () => friendTrail.geometry.dispose(), [friendTrail]);
  const friendStarTexture = useMemo(() => makeStarTexture(), []);
  useEffect(() => () => friendStarTexture.dispose(), [friendStarTexture]);

  // Orbit state: a wheel-driven target angle, the eased/rendered angle that
  // actually positions both characters (never frozen — always easing
  // toward the target), and which way hero is currently traveling around
  // the circle. Shared, not duplicated, so hero and its friend always move
  // off the same input rather than needing two independent copies of this
  // (already the trickiest part of the whole file) kept in sync by hand.
  const orbitAngleTargetRef = useRef(0);
  const orbitAngleRef = useRef(0);
  const orbitDirectionRef = useRef<1 | -1>(1);

  // Which way through the tunnel they're currently facing: away from the
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
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);

    const pVelocity = prevProgressRef.current === null ? 0 : p - prevProgressRef.current;
    prevProgressRef.current = p;
    if (pVelocity > 1e-6) tunnelFacingRef.current = 1;
    else if (pVelocity < -1e-6) tunnelFacingRef.current = -1;

    const camZ = state.camera.position.z;

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
    // exactly periodic) — but critically, whenever it's wrapped here, each
    // character's rotation (already driven by a function of this angle) is
    // nudged by the matching amount in the same instant, so neither ever
    // falls out of sync (leaving them out of sync is what used to make a
    // character visibly spin in place: the rotation-smoothing has no
    // concept of periodicity, so a stale offset just reads as a real
    // target it needs to spin all the way around to reach). Doing it
    // continuously also means reversing never has more than about one lap
    // to retrace, no matter how long it's been orbiting.
    //
    // Hero's own yaw is a function of +baseAngle, so it shifts by the same
    // -wrap applied to baseAngle below. The friend's angle is mirrored
    // (π - baseAngle, see friendAngle below), so when baseAngle shifts by
    // -wrap, the friend's angle shifts by the opposite +wrap — its
    // rotation needs the opposite correction, not the same one.
    while (Math.abs(orbitAngleRef.current) > Math.PI * 2) {
      const wrap = Math.sign(orbitAngleRef.current) * Math.PI * 2;
      orbitAngleRef.current -= wrap;
      orbitAngleTargetRef.current -= wrap;
      if (heroGroupRef.current) heroGroupRef.current.rotation.y -= wrap;
      if (friendGroupRef.current) friendGroupRef.current.rotation.y += wrap;
    }

    // Banks toward whichever way the gap is currently closing, leveling out
    // once there's nothing left to close — the rotation smoothing turns
    // this on/off target into a quick lean in and out rather than a snap.
    const turnRoll =
      Math.abs(gap) > 0.01 ? -Math.sign(gap) * ORBIT_MAX_ROLL * orbitBlend : 0;
    const smoothing = 1 - Math.pow(0.0005, delta);
    const direction = orbitDirectionRef.current;
    const tunnelFacing = tunnelFacingRef.current;
    const baseAngle = orbitAngleRef.current;
    // Warm, human-flattering light while a front is actually showing: in
    // the tunnel that's only while retreating (tunnelFacing === -1, facing
    // the camera); once circling the logo — the showcase moment — it's
    // warm throughout. Shared by both characters since tunnelFacing and
    // orbitBlend already are.
    const warmth = THREE.MathUtils.lerp(
      tunnelFacing === -1 ? 1 : 0,
      1,
      orbitBlend
    );

    // The entrance (see ENTRANCE_* above): 0 at the very start of the
    // scroll, 1 by ENTRANCE_PROGRESS_END — pushes each character's tunnel
    // offsets further out (to the side, and deeper in) the closer this is
    // to 0, so "arriving" is real, visible travel rather than a scale-up.
    const entranceBlend = THREE.MathUtils.smoothstep(p, 0, ENTRANCE_PROGRESS_END);

    const heroPose = computePose({
      camZ,
      t,
      orbitBlend,
      angle: baseAngle,
      direction,
      tunnelFacing,
      turnRoll,
      lateralOffset: THREE.MathUtils.lerp(
        HERO_LATERAL_OFFSET + ENTRANCE_EXTRA_LATERAL,
        HERO_LATERAL_OFFSET,
        entranceBlend
      ),
      zOffset: THREE.MathUtils.lerp(-ENTRANCE_EXTRA_DEPTH, 0, entranceBlend),
      timeOffset: 0,
      orbitRadius: ORBIT_RADIUS,
      orbitTilt: ORBIT_TILT,
    });
    applyHeroPose(heroGroupRef, heroKeyLightRef, heroRimLightRef, heroPose, smoothing, warmth);
    updateHeroTrail(heroGroupRef, heroTrail);

    // The friend mirrors hero rather than following it: π minus the shared
    // angle starts it on the opposite (left) side of the circle, and
    // because that flips the sign of its own angular rate relative to
    // hero's, it traces the circle in the opposite rotational sense
    // (clockwise while hero goes anti-clockwise) for free, with no separate
    // speed or direction state to keep in sync — flip the direction fed
    // into its own yaw calculation to match, so it still faces nose-first
    // along whichever way it's actually traveling.
    const friendAngle = Math.PI - baseAngle;
    const friendDirection: 1 | -1 = direction === 1 ? -1 : 1;
    // Banking into a turn means leaning the opposite way when circling in
    // the opposite rotational sense, so this mirrors along with everything
    // else above rather than reusing hero's own bank direction.
    const friendPose = computePose({
      camZ,
      t,
      orbitBlend,
      angle: friendAngle,
      direction: friendDirection,
      tunnelFacing,
      turnRoll: -turnRoll,
      lateralOffset: THREE.MathUtils.lerp(
        FRIEND_LATERAL_OFFSET - ENTRANCE_EXTRA_LATERAL,
        FRIEND_LATERAL_OFFSET,
        entranceBlend
      ),
      zOffset: THREE.MathUtils.lerp(
        FRIEND_Z_OFFSET - ENTRANCE_EXTRA_DEPTH,
        FRIEND_Z_OFFSET,
        entranceBlend
      ),
      timeOffset: FRIEND_TIME_OFFSET,
      orbitRadius: FRIEND_ORBIT_RADIUS,
      orbitTilt: FRIEND_ORBIT_TILT,
    });
    applyHeroPose(
      friendGroupRef,
      friendKeyLightRef,
      friendRimLightRef,
      friendPose,
      smoothing,
      warmth
    );
    updateHeroTrail(friendGroupRef, friendTrail);
  });

  return (
    <>
      <group ref={heroGroupRef}>
        <pointLight
          ref={heroKeyLightRef}
          color="#4fd6ff"
          intensity={KEY_LIGHT_INTENSITY}
          distance={10}
          position={[1.2, 1, 1.5]}
        />
        <pointLight
          ref={heroRimLightRef}
          color="#ffffff"
          intensity={RIM_LIGHT_INTENSITY}
          distance={9}
          position={[-1.2, -0.6, -1.5]}
        />
        <HeroBoundary>
          <Suspense fallback={null}>
            <HeroModel url={HERO_URL} />
          </Suspense>
        </HeroBoundary>
      </group>
      <points geometry={heroTrail.geometry}>
        <pointsMaterial
          map={heroStarTexture}
          alphaTest={0.05}
          size={0.22}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      <group ref={friendGroupRef}>
        <pointLight
          ref={friendKeyLightRef}
          color="#4fd6ff"
          intensity={KEY_LIGHT_INTENSITY}
          distance={10}
          position={[1.2, 1, 1.5]}
        />
        <pointLight
          ref={friendRimLightRef}
          color="#ffffff"
          intensity={RIM_LIGHT_INTENSITY}
          distance={9}
          position={[-1.2, -0.6, -1.5]}
        />
        <HeroBoundary>
          <Suspense fallback={null}>
            <HeroModel url={FRIEND_URL} />
          </Suspense>
        </HeroBoundary>
      </group>
      <points geometry={friendTrail.geometry}>
        <pointsMaterial
          map={friendStarTexture}
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

// Applies this frame's pose to one character's group, rotation, and lights —
// takes the exact ref variables directly (never a bundled object) so the
// hooks linter can trace each one straight back to its own useRef() call.
// Position is set directly (never frozen); rotation eases toward its
// target by the shared `smoothing` factor. Always at full scale/intensity
// — see ENTRANCE_* above for how "arriving"/"leaving" is handled instead,
// through real position and distance rather than scaling up from nothing.
function applyHeroPose(
  groupRef: { current: THREE.Group | null },
  keyLightRef: { current: THREE.PointLight | null },
  rimLightRef: { current: THREE.PointLight | null },
  pose: Pose,
  smoothing: number,
  warmth: number
) {
  const group = groupRef.current;
  if (!group) return;

  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, pose.rotY, smoothing);
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, pose.rotZ, smoothing);

  // The tunnel's ambient light is deliberately dim — carry the character's
  // own key + rim light with it so the PBR material actually reads instead
  // of rendering near-black in the empty stretches between set pieces. The
  // color itself blends cool -> warm with `warmth` (see its calculation
  // for what "front-facing" means here) — .copy() then .lerp() mutates the
  // light's own Color in place, leaving the cool/warm constants untouched
  // so this is safe to call every frame with no per-frame allocation.
  const keyLight = keyLightRef.current;
  if (keyLight) {
    keyLight.intensity = KEY_LIGHT_INTENSITY;
    keyLight.color.copy(KEY_LIGHT_COOL_COLOR).lerp(KEY_LIGHT_WARM_COLOR, warmth);
  }
  const rimLight = rimLightRef.current;
  if (rimLight) {
    rimLight.intensity = RIM_LIGHT_INTENSITY;
    rimLight.color.copy(RIM_LIGHT_COOL_COLOR).lerp(RIM_LIGHT_WARM_COLOR, warmth);
  }
}

// Advances one character's comet-style trail (a short ring buffer of past
// positions rendered as dimming star sprites) to its current position.
function updateHeroTrail(
  groupRef: { current: THREE.Group | null },
  trail: ReturnType<typeof createTrailAssets>
) {
  const group = groupRef.current;
  if (!group) return;
  const { history, geometry, color } = trail;

  // Only record a new trail point once it's moved far enough from the last
  // one (see TRAIL_MIN_SPACING above); otherwise just keep the head glued
  // to the model's current position.
  const head = history[0];
  if (
    head.distanceToSquared(group.position) >
    TRAIL_MIN_SPACING * TRAIL_MIN_SPACING
  ) {
    for (let i = history.length - 1; i > 0; i--) {
      history[i].copy(history[i - 1]);
    }
  }
  history[0].copy(group.position);

  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const point = history[i];
    posAttr.setXYZ(i, point.x, point.y, point.z);
    const fade = 1 - i / TRAIL_COUNT;
    colorAttr.setXYZ(i, color.r * fade, color.g * fade, color.b * fade);
  }
  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
}
