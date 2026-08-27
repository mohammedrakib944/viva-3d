"use client";

import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const starRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const star = starRef.current;
    if (!star) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let angle = 0;
    let domHover = false;
    let canvasHover = false;
    let dragging = false;

    const applyScale = () => {
      const scale = dragging ? 2.6 : domHover || canvasHover ? 1.8 : 1;
      star.style.setProperty("--scale", String(scale));
      star.style.setProperty("--star-color", dragging ? "#ffffff" : "#4fd6ff");
    };

    const onMove = (e: PointerEvent) => {
      // Track the pointer with zero lag — only rotation is animated.
      x = e.clientX;
      y = e.clientY;
      const target = e.target as HTMLElement;
      domHover = !!target.closest("[data-hover]");
      applyScale();
      star.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(var(--scale, 1))`;
    };

    // 3D scene objects (e.g. the interactive "10") aren't part of the DOM
    // tree inside the canvas, so they signal hover through this event
    // instead of the data-hover attribute check above.
    const onCanvasHover = (e: Event) => {
      canvasHover = (e as CustomEvent<boolean>).detail;
      applyScale();
    };

    // Extra tactile feedback while actively dragging an interactive object
    // (e.g. the "10") — the star grows and turns white.
    const onCanvasDrag = (e: Event) => {
      dragging = (e as CustomEvent<boolean>).detail;
      applyScale();
    };

    let frame: number;
    const tick = () => {
      angle += 0.4;
      star.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(var(--scale, 1))`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("cursor-hover", onCanvasHover);
    window.addEventListener("cursor-drag", onCanvasDrag);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("cursor-hover", onCanvasHover);
      window.removeEventListener("cursor-drag", onCanvasDrag);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={starRef}
      className="pointer-events-none fixed left-0 top-0 z-[999] hidden sm:block"
      style={{ willChange: "transform" }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        style={{
          filter: "drop-shadow(0 0 6px rgba(79,214,255,0.8))",
        }}
      >
        <path
          d="M12 2L13.6 10.4L22 12L13.6 13.6L12 22L10.4 13.6L2 12L10.4 10.4L12 2Z"
          fill="var(--star-color, #4fd6ff)"
        />
      </svg>
    </div>
  );
}
