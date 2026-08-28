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
  // page (scroll doesn't count). The boot sequence's "ENTER" button is
  // *guaranteed* to be the first interaction available (it's the only
  // clickable thing behind a full-screen, scroll-locked overlay), so that
  // explicit `start()` call below is the only unlock path needed — an
  // earlier "first interaction anywhere" fallback listener used to race
  // against it (pointerdown fires before React's click, so it would win
  // and silently make the ENTER handler's own start() a no-op), which
  // made the actual trigger path hard to reason about.

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
