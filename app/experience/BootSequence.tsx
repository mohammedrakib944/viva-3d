"use client";

import { useEffect, useState } from "react";

const LINES = ["INITIALIZING...", "10 YEARS OF VIVASOFT"];

export default function BootSequence({
  onEnter,
  onComplete,
}: {
  onEnter: () => void;
  onComplete: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [typed, setTyped] = useState(["", ""]);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        setStage(1);
        typeLine(0, LINES[0], () => {
          timers.push(
            setTimeout(() => {
              setStage(2);
              typeLine(1, LINES[1], () => {
                timers.push(setTimeout(() => setStage(3), 900));
              });
            }, 500),
          );
        });
      }, 900),
    );

    function typeLine(idx: number, text: string, cb: () => void) {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setTyped((prev) => {
          const next = [...prev];
          next[idx] = text.slice(0, i);
          return next;
        });
        if (i >= text.length) {
          clearInterval(interval);
          cb();
        }
      }, 45);
    }

    return () => timers.forEach(clearTimeout);
  }, []);

  const handleEnter = () => {
    if (leaving) return;
    onEnter();
    setLeaving(true);
    setTimeout(onComplete, 900);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030308] transition-opacity duration-900 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: "900ms" }}
    >
      <div className="flex flex-col items-center gap-3 font-mono text-sm tracking-[0.3em] text-white/80">
        {stage === 0 && (
          <span className="h-3 w-[2px] animate-pulse bg-white/70" />
        )}

        {stage >= 1 && (
          <p className="text-white/50">
            {typed[0]}
            {stage === 1 && (
              <span className="animate-pulse border-r border-white/60 ml-0.5" />
            )}
          </p>
        )}

        {stage >= 1 && (
          <div className="relative h-[1px] w-56 overflow-hidden bg-white/10">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-[--accent] to-transparent ${
                stage >= 1 ? "boot-line" : ""
              }`}
              style={{ width: "40%" }}
            />
          </div>
        )}

        {stage >= 2 && (
          <p className="mt-2 text-lg font-semibold tracking-[0.5em] text-white">
            {typed[1]}
          </p>
        )}

        {stage >= 3 && (
          <div className="mt-4 flex flex-col items-center gap-1 text-[11px] font-normal text-white/40 fade-in">
            <p>YEAR: 2016 → 2026</p>
            <p className="text-[--accent]">STATUS: ONLINE</p>
          </div>
        )}

        {stage >= 3 && (
          <button
            data-hover
            onClick={handleEnter}
            className="fade-in mt-8 scale-100 rounded-sm border border-white/20 px-6 py-2.5 text-xs font-medium tracking-[0.3em] text-white transition-all duration-200 hover:scale-105 hover:border-[--accent] hover:text-[--accent] hover:shadow-[0_0_20px_-4px_var(--accent)] active:scale-95 active:duration-75"
            style={{ animationDelay: "0.4s" }}
          >
            ENTER
          </button>
        )}
      </div>

      <style jsx>{`
        .boot-line {
          animation: sweep 1.6s ease-in-out infinite;
        }
        @keyframes sweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(350%);
          }
        }
        .fade-in {
          animation: fadeIn 0.8s ease forwards;
          opacity: 0;
        }
        @keyframes fadeIn {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
