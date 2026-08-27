"use client";

import { useEffect, useState } from "react";
import { useScroll } from "./ScrollProvider";

export function useScrollValue(precision = 2) {
  const { progressRef } = useScroll();
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame: number;
    const factor = 10 ** precision;
    const tick = () => {
      const rounded =
        Math.round(progressRef.current.value * factor) / factor;
      setValue((prev) => (prev === rounded ? prev : rounded));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progressRef, precision]);

  return value;
}
