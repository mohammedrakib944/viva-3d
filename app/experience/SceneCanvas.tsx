"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Scene from "./Scene";

export default function SceneCanvas() {
  const [lost, setLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lost) return;
    // If the browser can't restore the context on its own within 2s
    // (common on software/Mesa renderers), force a full remount.
    restoreTimer.current = setTimeout(() => {
      setCanvasKey((k) => k + 1);
      setLost(false);
    }, 2000);
    return () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, [lost]);

  return (
    <>
      <Canvas
        key={canvasKey}
        camera={{ position: [0, 0, 9], fov: 55, near: 0.1, far: 220 }}
        gl={{ antialias: false, powerPreference: "default", alpha: false }}
        dpr={1}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.warn("WebGL context lost");
            setLost(true);
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.warn("WebGL context restored");
            setLost(false);
          });
        }}
      >
        <color attach="background" args={["#030308"]} />
        <fog attach="fog" args={["#030308", 12, 75]} />
        <ambientLight intensity={0.15} />
        <Scene />
      </Canvas>

      {lost && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#030308] text-center font-mono text-xs tracking-[0.2em] text-white/50">
          RECONNECTING GRAPHICS CONTEXT…
        </div>
      )}
    </>
  );
}
