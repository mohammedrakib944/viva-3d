"use client";

import { useEffect, useMemo, useState } from "react";
import { useScroll } from "./ScrollProvider";
import { useScrollValue } from "./useScrollValue";
import { MILESTONES } from "./data";
import LogoReveal from "./LogoReveal";

const SECTIONS = [
  { label: "ORIGIN", at: 0 },
  { label: "JOURNEY", at: 0.16 },
  { label: "FUTURE", at: 0.82 },
];

export default function Hud({
  visible,
  soundOn,
  onToggleSound,
}: {
  visible: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const { scrollTo } = useScroll();
  const progress = useScrollValue(3);

  const activeSection = useMemo(() => {
    let idx = 0;
    SECTIONS.forEach((s, i) => {
      if (progress >= s.at) idx = i;
    });
    return idx;
  }, [progress]);

  const milestone = useMemo(() => {
    if (progress < 0.17 || progress > 0.83) return null;
    const t = (progress - 0.16) / 0.66;
    const idx = Math.round(
      Math.min(MILESTONES.length - 1, Math.max(0, t * (MILESTONES.length - 1)))
    );
    return MILESTONES[idx];
  }, [progress]);

  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [milestone?.year]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* floating nav */}
      <div className="pointer-events-auto absolute left-6 top-6 flex flex-col gap-3 font-mono text-[11px] tracking-[0.25em] text-white/50 sm:left-10 sm:top-10">
        <span className="text-white/80">VIVASOFT 10</span>
        {SECTIONS.map((s, i) => (
          <button
            key={s.label}
            data-hover
            onClick={() => scrollTo(s.at)}
            className={`text-left transition-colors hover:text-[--accent] ${
              activeSection === i ? "text-[--accent]" : ""
            }`}
          >
            0{i + 1} {s.label}
          </button>
        ))}
      </div>

      {/* progress + sound */}
      <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-4 font-mono text-[11px] tracking-[0.25em] text-white/50 sm:right-10 sm:top-10">
        <button
          data-hover
          data-sound-toggle
          onClick={onToggleSound}
          className="rounded-sm border border-white/10 px-3 py-1.5 transition-colors hover:border-[--accent]/50 hover:text-[--accent]"
        >
          {soundOn ? "MUTE" : "UNMUTE"}
        </button>
        <span>0{activeSection + 1} / 03</span>
      </div>

      {/* scroll hint */}
      {progress < 0.03 && (
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-white/40">
          <span>SCROLL TO BEGIN</span>
          <span className="h-6 w-[1px] animate-pulse bg-white/30" />
        </div>
      )}

      {/* milestone card */}
      {milestone && (
        <button
          key={milestone.year}
          data-hover
          onClick={() => setExpanded((e) => !e)}
          className="pointer-events-auto absolute bottom-14 left-1/2 w-[min(90vw,380px)] -translate-x-1/2 border-l border-[--accent]/40 bg-white/[0.03] px-5 py-4 text-left backdrop-blur-sm transition-opacity duration-500 sm:left-10 sm:translate-x-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-[--accent]">
                {milestone.year}
              </p>
              <p className="mt-1 text-sm font-semibold tracking-[0.1em] text-white">
                {milestone.title}
              </p>
              <p className="mt-1 text-xs text-white/50">{milestone.desc}</p>
            </div>
            <span className="mt-1 shrink-0 font-mono text-[9px] tracking-[0.2em] text-white/40">
              {expanded ? "− CLOSE" : "+ EXPLORE"}
            </span>
          </div>

          {expanded && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <ul className="space-y-1.5">
                {milestone.story.map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-xs leading-relaxed text-white/60"
                  >
                    <span className="text-[--accent]">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-2">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold text-black"
                  style={{ background: milestone.client.color }}
                >
                  {milestone.client.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-mono text-[9px] tracking-[0.2em] text-white/40">
                  {milestone.client.name} · {milestone.client.tag}
                </span>
              </div>
            </div>
          )}
        </button>
      )}

      {/* final message */}
      {progress > 0.94 && (
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-5 pb-16 text-center">
          <LogoReveal />
          <p className="font-mono text-xs tracking-[0.4em] text-white/50">
            2016 — 2026
          </p>
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            TEN YEARS OF BUILDING WHAT&apos;S NEXT.
          </h2>
          <p className="text-sm text-white/50">
            The next chapter is ours to build.
          </p>
        </div>
      )}
    </div>
  );
}
