"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import Lenis from "lenis";

type ScrollState = {
  value: number;
};

type ScrollContextValue = {
  progressRef: React.RefObject<ScrollState>;
  scrollTo: (fraction: number) => void;
};

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({
  children,
  locked,
}: {
  children: ReactNode;
  locked: boolean;
}) {
  const progressRef = useRef<ScrollState>({ value: 0 });
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      touchMultiplier: 1.2,
    });
    lenisRef.current = lenis;

    let frameId: number;
    function raf(time: number) {
      lenis.raf(time);
      const limit = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );
      progressRef.current.value = Math.min(1, Math.max(0, lenis.scroll / limit));
      frameId = requestAnimationFrame(raf);
    }
    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = locked ? "hidden" : "";
    if (!locked) {
      // The page is only 100vh tall while boot is locking scroll; once it
      // unlocks, the spacer grows to 600vh but Lenis measured its scroll
      // limit at construction time and won't know the content grew unless
      // told to re-measure.
      requestAnimationFrame(() => lenisRef.current?.resize());
    }
  }, [locked]);

  const scrollTo = (fraction: number) => {
    const limit = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    lenisRef.current?.scrollTo(limit * fraction, { duration: 1.4 });
  };

  return (
    <ScrollContext.Provider value={{ progressRef, scrollTo }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll() {
  const ctx = useContext(ScrollContext);
  if (!ctx) throw new Error("useScroll must be used within ScrollProvider");
  return ctx;
}
