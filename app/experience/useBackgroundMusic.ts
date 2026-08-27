"use client";

import { useEffect, useRef, useState } from "react";

export function useBackgroundMusic() {
  const [on, setOn] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const fadeTo = (target: number, duration: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
    const clampedTarget = Math.min(1, Math.max(0, target));
    const start = Math.min(1, Math.max(0, audio.volume));
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const value = start + (clampedTarget - start) * t;
      audio.volume = Math.min(1, Math.max(0, value));
      if (t < 1) {
        fadeRef.current = requestAnimationFrame(step);
      } else if (clampedTarget === 0) {
        audio.pause();
      }
    };
    fadeRef.current = requestAnimationFrame(step);
  };

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio("/music.mp3");
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    return () => {
      audio.pause();
      if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
    };
  }, []);

  // Browsers block autoplay with sound until the user interacts with the
  // page (scroll doesn't count). Start playback on the first genuine
  // interaction elsewhere on the page, if still desired.
  useEffect(() => {
    const startOnInteraction = (e: Event) => {
      if (startedRef.current) return;

      // The sound toggle button handles its own click via the effect below,
      // so it must not also trigger this generic unlock path.
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-sound-toggle]")) return;

      startedRef.current = true;
      const audio = audioRef.current;
      if (audio && on) {
        audio.play().catch(() => {});
        fadeTo(0.35, 1200);
      }
      window.removeEventListener("pointerdown", startOnInteraction);
      window.removeEventListener("keydown", startOnInteraction);
    };
    window.addEventListener("pointerdown", startOnInteraction);
    window.addEventListener("keydown", startOnInteraction);
    return () => {
      window.removeEventListener("pointerdown", startOnInteraction);
      window.removeEventListener("keydown", startOnInteraction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to explicit toggles (a button click is itself a valid user
  // gesture, so playback is allowed to start here even before the first
  // interaction above has fired).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    startedRef.current = true;
    const audio = audioRef.current;
    if (!audio) return;
    if (on) {
      audio.play().catch(() => {});
      fadeTo(0.35, 1200);
    } else {
      fadeTo(0, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const toggle = () => setOn((prev) => !prev);

  // Explicitly begin playback from within a real click/tap handler (e.g. the
  // boot sequence's "ENTER" button), which reliably satisfies the browser's
  // autoplay-with-sound gesture requirement.
  const start = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const audio = audioRef.current;
    if (audio && on) {
      audio.play().catch(() => {});
      fadeTo(0.35, 1200);
    }
  };

  return { on, toggle, start };
}
