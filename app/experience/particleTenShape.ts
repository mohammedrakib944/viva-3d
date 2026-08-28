import * as THREE from "three";
import { TextGeometry, type Font } from "three-stdlib";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

/**
 * Scatters `count` points across the surface of 3D text built from the
 * given font, so a particle system can start life shaped like it and
 * disperse from there — rather than a crude approximated silhouette.
 *
 * Returns, for each point: its centered position, and a 0..1 "detach rank"
 * where 0 = farthest from the shape's center (should peel away first) and
 * 1 = closest to the center (should hold together longest) — driving the
 * outside-in breakup effect.
 */
export function sampleTenShape(
  font: Font,
  count: number,
  text = "10 years",
  size = 0.85
) {
  const geometry = new TextGeometry(text, {
    font,
    size,
    height: size * 0.25,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: size * 0.02,
    bevelSize: size * 0.0125,
  });
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const center = new THREE.Vector3();
  geometry.boundingBox?.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const mesh = new THREE.Mesh(geometry);
  const sampler = new MeshSurfaceSampler(mesh).build();

  const positions = new Float32Array(count * 3);
  const distances = new Float32Array(count);

  const tempPosition = new THREE.Vector3();
  const tempNormal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    sampler.sample(tempPosition, tempNormal);

    // A fraction of particles drift slightly off the surface along their
    // normal, so the shape reads as loosely held together rather than a
    // perfectly solid crust of particles — kept small relative to the
    // text's own size so it doesn't blur the letterforms into mush.
    if (Math.random() < 0.12) {
      tempPosition.addScaledVector(tempNormal, Math.random() * size * 0.22);
    }

    positions[i * 3] = tempPosition.x;
    positions[i * 3 + 1] = tempPosition.y;
    positions[i * 3 + 2] = tempPosition.z;
    distances[i] = tempPosition.length();
  }

  geometry.dispose();

  // Rank by distance from center, descending — but with a large random
  // jitter mixed into the score first. Ranking by pure distance makes
  // every particle at roughly the same radius detach at roughly the same
  // moment, which reads as a clean ring peeling inward rather than an
  // organic crumbling. The jitter scrambles same-radius particles across
  // very different detach times while keeping a loose outside-first bias
  // overall, so it breaks apart from scattered spots instead of rings.
  let minDist = Infinity;
  let maxDist = -Infinity;
  for (let i = 0; i < count; i++) {
    if (distances[i] < minDist) minDist = distances[i];
    if (distances[i] > maxDist) maxDist = distances[i];
  }
  const distanceRange = Math.max(0.0001, maxDist - minDist);
  const jitterAmplitude = distanceRange * 1.4;
  // Precomputed once per particle — sort comparators must be consistent
  // across repeated calls for the same pair, so the jitter can't be
  // generated fresh inside the comparator itself.
  const jitteredScore = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    jitteredScore[i] = distances[i] + (Math.random() - 0.5) * jitterAmplitude;
  }

  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => jitteredScore[b] - jitteredScore[a]
  );
  const detachThreshold = new Float32Array(count);
  order.forEach((particleIndex, rank) => {
    detachThreshold[particleIndex] = count <= 1 ? 0 : rank / (count - 1);
  });

  // A random, uniformly-distributed-on-a-sphere outward kick for each
  // particle — used as the midpoint of a curved path out of the "10", so
  // particles scatter into open space in random directions rather than
  // interpolating in a straight line toward the tunnel's circular cross
  // section (which reads as everything contracting toward one center).
  const explosionOffset = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dist = 2.5 + Math.random() * 4.5;
    explosionOffset[i * 3] = Math.sin(phi) * Math.cos(theta) * dist;
    explosionOffset[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * dist;
    explosionOffset[i * 3 + 2] = Math.cos(phi) * dist;
  }

  return { positions, detachThreshold, explosionOffset };
}
