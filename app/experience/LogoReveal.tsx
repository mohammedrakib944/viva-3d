"use client";

import { useEffect, useState } from "react";

export default function LogoReveal() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/vivasoft-Logo.svg"
      alt="Vivasoft"
      className="h-7 w-auto sm:h-9"
      style={{
        opacity: entered ? 1 : 0,
        // The logo's wordmark is a dark navy (#00156A) that all but
        // disappears on a near-black background, so it's rendered as a
        // glowing white silhouette here rather than its brand colors.
        filter: entered
          ? "brightness(0) invert(1) drop-shadow(0 0 22px rgba(79,214,255,0.75))"
          : "brightness(0) invert(1) blur(14px)",
        transform: entered ? "scale(1)" : "scale(1.25)",
        transition:
          "opacity 1.6s ease, filter 1.6s ease, transform 1.6s cubic-bezier(0.16,1,0.3,1)",
      }}
    />
  );
}
