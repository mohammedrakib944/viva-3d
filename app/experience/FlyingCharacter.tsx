"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { MTLLoader, OBJLoader } from "three-stdlib";
import * as THREE from "three";
import { useScroll } from "./ScrollProvider";

const OBJ_URL = "/3d-model-1/man.obj";
const MTL_URL = "/3d-model-1/man-optimized.mtl";
const TARGET_HEIGHT = 2.6;
const RENDER_ORDER = 999;

// Cache decoded network responses (the .obj/.mtl/.jpg) so a scene remount —
// e.g. the WebGL-context-loss recovery path in SceneCanvas — reuses what's
// already been fetched instead of re-downloading ~3.5MB over the network.
THREE.Cache.enabled = true;

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const key of Object.keys(mat) as (keyof typeof mat)[]) {
        const value = mat[key];
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}

function Flyer() {
  const { progressRef } = useScroll();
  const groupRef = useRef<THREE.Group>(null);

  const materials = useLoader(MTLLoader, MTL_URL);
  const configureObjLoader = useCallback(
    (loader: OBJLoader) => {
      materials.preload();
      loader.setMaterials(materials);
    },
    [materials]
  );
  const obj = useLoader(OBJLoader, OBJ_URL, configureObjLoader);

  // Normalize the imported mesh's arbitrary export scale/pivot to a known
  // size, centered on its own origin, so the flight-path math below can
  // treat it as a unit-scale object regardless of what units it was
  // modeled/exported in.
  const model = useMemo(() => {
    const clone = obj.clone(true);

    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const materialList = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      mesh.material = materialList.map((mat) => {
        const map = (mat as THREE.MeshPhongMaterial | undefined)?.map ?? null;
        if (map) {
          // Modern three.js requires this explicitly for correct sRGB
          // decoding — without it, imported color textures render duller
          // and flatter than the source file.
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 4;
        }

        // Swap the imported Phong material (lit, and dependent on this
        // export's face-normal direction being correct) for an unlit basic
        // material. OBJ exports frequently have inconsistent/flipped
        // normals, which under real lighting reads as random dark patches
        // or an almost-invisible mesh — unlit sidesteps that entirely and
        // guarantees the character is always clearly visible.
        const replacement = new THREE.MeshBasicMaterial({
          map,
          color: map ? 0xffffff : 0xdddddd,
          transparent: true,
          // Drawn after (and ignoring depth from) the rest of the scene so
          // it always reads on top rather than getting lost behind the
          // tunnel particles or year markers.
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });

        mat.dispose();
        return replacement;
      });

      mesh.renderOrder = RENDER_ORDER;
    });

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    const rawScale = TARGET_HEIGHT / Math.max(size.y, 0.0001);
    // Guard against a degenerate/zero-size export blowing the scale up to
    // something absurd instead of just quietly failing to render sanely.
    const scale = Number.isFinite(rawScale)
      ? THREE.MathUtils.clamp(rawScale, 0.001, 1000)
      : 1;
    clone.scale.setScalar(scale);

    return clone;
  }, [obj]);

  // Release GPU memory (geometry/material/texture) when this instance goes
  // away — otherwise repeated dev-mode hot reloads or context-loss remounts
  // slowly leak VRAM over a long session.
  useEffect(() => {
    return () => disposeObject3D(model);
  }, [model]);

  useFrame((state, delta) => {
    const p = progressRef.current.value;
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    // Fly roughly alongside the camera through the tunnel, weaving in a
    // wide, lazy figure-eight rather than following a fixed rail — reads
    // as genuinely exploring the space instead of being towed through it.
    const camZ = state.camera.position.z;
    const followZ = camZ - 6 - Math.sin(t * 0.25) * 3;

    const weaveX = Math.sin(t * 0.35) * 2.6 + Math.sin(t * 0.9) * 0.4;
    const weaveY = Math.cos(t * 0.28) * 1.3 + Math.sin(t * 1.3) * 0.2;

    groupRef.current.position.set(weaveX, weaveY, followZ);

    // Bank into turns and pitch with vertical motion for a believable
    // broomstick-flight feel rather than a rigid, static glide. The
    // smoothing factor is frame-rate independent (exponential decay scaled
    // by delta) rather than a fixed per-frame lerp, so motion stays
    // consistent even when the frame rate dips or stutters.
    const smoothing = 1 - Math.pow(0.0005, delta);
    const velX = Math.cos(t * 0.35) * 0.35 * 2.6;
    const velY = -Math.sin(t * 0.28) * 0.28 * 1.3;
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      -velX * 0.4,
      smoothing
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      velY * 0.6,
      smoothing
    );
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      Math.PI + velX * 0.3,
      smoothing
    );

    // Fade out during the boot/initial-commit scene and the final "10"
    // climax, where a flying character would clutter the shot.
    const visibility =
      THREE.MathUtils.smoothstep(p, 0.06, 0.14) *
      (1 - THREE.MathUtils.smoothstep(p, 0.8, 0.86));
    groupRef.current.visible = visibility > 0.02;
    groupRef.current.scale.setScalar(visibility);
  });

  // Unlit material (see above) — no light rig needed here, it renders at
  // full brightness regardless of position in the scene.
  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

class FlyerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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
    <FlyerBoundary>
      <Suspense fallback={null}>
        <Flyer />
      </Suspense>
    </FlyerBoundary>
  );
}
