"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import BootSequence from "./BootSequence";
import { ScrollProvider } from "./ScrollProvider";
import Hud from "./Hud";
import CustomCursor from "./CustomCursor";
import { useBackgroundMusic } from "./useBackgroundMusic";

const SceneCanvas = dynamic(() => import("./SceneCanvas"), { ssr: false });

export default function Experience() {
  const [booted, setBooted] = useState(false);
  const { on: soundOn, toggle: toggleSound, start: startMusic } =
    useBackgroundMusic();

  return (
    <ScrollProvider locked={!booted}>
      <CustomCursor />

      {!booted && (
        <BootSequence
          onEnter={startMusic}
          onComplete={() => setBooted(true)}
        />
      )}

      <div
        className={`fixed inset-0 transition-opacity duration-1000 ${
          booted ? "opacity-100" : "opacity-0"
        }`}
      >
        <SceneCanvas />
      </div>

      <Hud visible={booted} soundOn={soundOn} onToggleSound={toggleSound} />

      <div style={{ height: booted ? "600vh" : "100vh" }} />
    </ScrollProvider>
  );
}
