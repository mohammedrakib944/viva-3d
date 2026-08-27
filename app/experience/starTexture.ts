import * as THREE from "three";

// Draws the same 4-point sparkle used by the custom cursor (see
// CustomCursor.tsx) onto a canvas — shared by anything that wants
// star-shaped point sprites (tunnel particles, flight trails, ...).
export function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);

  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(13.6, 10.4);
  ctx.lineTo(22, 12);
  ctx.lineTo(13.6, 13.6);
  ctx.lineTo(12, 22);
  ctx.lineTo(10.4, 13.6);
  ctx.lineTo(2, 12);
  ctx.lineTo(10.4, 10.4);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
