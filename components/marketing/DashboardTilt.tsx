"use client";

import { useRef } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Home,
  Settings,
  Sparkles,
  Users,
  Mic,
} from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "./fonts";

/*
 * A hiring dashboard drawn as a 3D object. At rest it is turned away from
 * the viewer with its parts lifted off the panel as separate layers
 * (translateZ). On hover it swings round to face them and every part
 * settles back onto the panel; on leave it turns away and they rise again.
 *
 * All figures are illustrative; the panel is aria-hidden.
 */

const TILT = { rotateY: -20, rotateX: 11, rotateZ: 3 };
const TILT_TOUCH = { rotateY: -12, rotateX: 7, rotateZ: 2 };
const FLAT = { rotateY: 0, rotateX: 0, rotateZ: 0 };

const STATS = [
  { label: "Resumes scored", value: "1,284", delta: "12%", up: true, good: true },
  { label: "Active jobs", value: "36", delta: "8%", up: true, good: true },
  { label: "AI interviews", value: "64", delta: "20%", up: true, good: true },
];

const PIPELINE = [
  { label: "Scored", share: 48, color: "var(--mkt-accent-solid)" },
  { label: "Assessed", share: 32, color: "var(--mkt-cyan)" },
  { label: "Interviewed", share: 20, color: "var(--mkt-amber)" },
];

/**
 * How far a layer lifts. Phones get less depth: on a narrow panel the same
 * lift throws the outer chips past the screen edge.
 */
function liftOf(el: HTMLElement) {
  const scale = window.matchMedia("(max-width: 639px)").matches ? 0.45 : 1;
  return Number(el.dataset.layer) * scale;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Shortlists per day, drawn as a smooth line (viewBox 0 0 300 100).
const LINE = "M0 70 C 25 70, 30 88, 55 86 S 90 58, 115 64 S 150 92, 175 80 S 205 46, 230 48 S 270 62, 300 40";
const AREA = `${LINE} L 300 100 L 0 100 Z`;

/** A layer that floats `z` px above whatever it sits on. */
function Layer({
  z,
  className = "",
  children,
}: {
  z: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-layer={z} className={`[transform-style:preserve-3d] ${className}`}>
      {children}
    </div>
  );
}

export function DashboardTilt() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const straight = useRef(false);

  useGSAP(
    () => {
      const layers = gsap.utils.toArray<HTMLElement>("[data-layer]", root.current);
      const touch = window.matchMedia("(hover: none)").matches;
      const rest = touch ? TILT_TOUCH : TILT;

      // Lift every layer to its height, and set the resting angle.
      layers.forEach((el) => gsap.set(el, { z: liftOf(el) }));
      gsap.set(stage.current, { ...rest, transformPerspective: 1600 });

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Entrance: the panel swings in from further round, then each layer
        // rises off it in turn; the chart line draws and the ring fills.
        const line = root.current!.querySelector<SVGPathElement>("[data-line]")!;
        const length = line.getTotalLength();
        const tl = gsap.timeline({ delay: 0.25 });
        tl.from(stage.current, {
          rotateY: -42,
          rotateX: 22,
          y: 60,
          autoAlpha: 0,
          duration: 1.3,
          ease: "power3.out",
        })
          .from(layers, { z: 0, duration: 0.9, stagger: 0.06, ease: "power3.out" }, 0.45)
          .fromTo(
            line,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" },
            0.7
          )
          .from("[data-area]", { autoAlpha: 0, duration: 0.8 }, 1.2)
          .from("[data-arc]", { strokeDasharray: "0 100", duration: 1.1, stagger: 0.12, ease: "power2.out" }, 0.9)
          .from("[data-peak]", { scale: 0, autoAlpha: 0, duration: 0.45, ease: "back.out(2.5)", transformOrigin: "50% 100%" }, 1.9);

        // The floating chips bob gently, out of step with each other.
        gsap.utils.toArray<HTMLElement>("[data-float]", root.current).forEach((el, i) => {
          gsap.to(el, {
            y: i % 2 ? 8 : -8,
            duration: 2.6 + i * 0.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        });
      });
    },
    { scope: root }
  );

  // Event-handler only (never runs during render).
  const turn = (toStraight: boolean) => {
    straight.current = toStraight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(hover: none)").matches;
    const duration = reduce ? 0 : 0.9;
    gsap.to(stage.current, {
      ...(toStraight ? FLAT : touch ? TILT_TOUCH : TILT),
      duration,
      ease: "power3.out",
      overwrite: "auto",
    });
    // Facing the viewer, every lifted part settles back onto the panel;
    // turned away again, they rise to their heights.
    gsap.to(gsap.utils.toArray<HTMLElement>("[data-layer]", root.current), {
      z: (_: number, el: HTMLElement) => (toStraight ? 0 : liftOf(el)),
      duration,
      ease: "power3.out",
      stagger: toStraight ? 0 : 0.03,
      overwrite: "auto",
    });
  };

  const onTap = (e: React.MouseEvent) => {
    if ((e.nativeEvent as PointerEvent).pointerType !== "mouse") turn(!straight.current);
  };

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="relative select-none [perspective:1600px]"
      onPointerEnter={(e) => e.pointerType === "mouse" && turn(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && turn(false)}
      // Touch has no hover: a tap swings it round, another tap back.
      onClick={onTap}
    >
      {/* Soft halo behind the object */}
      <div className="pointer-events-none absolute inset-x-[8%] inset-y-[10%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(15,60,153,0.22),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.3),transparent)]" />

      <div ref={stage} className="relative [transform-style:preserve-3d]">
        {/* Base panel */}
        <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-[22px] border border-slate-900/[0.08] bg-mkt-surface p-3 shadow-[0_50px_100px_-40px_rgba(15,60,153,0.45),0_2px_6px_rgba(8,19,46,0.06)] [transform-style:preserve-3d] dark:border-white/10 dark:shadow-[0_50px_100px_-40px_rgba(0,0,0,0.7)] sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-4 sm:rounded-[26px] sm:p-5">
          {/* Sidebar */}
          <div className="flex flex-col items-center gap-3 border-r border-slate-900/[0.06] pr-2 pt-1 dark:border-white/[0.08] sm:gap-4 sm:pr-3">
            <img src="/logos/favicon.png" alt="" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
            {[Home, Briefcase, BarChart3, Users, Settings].map((Icon, i) => (
              <span
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-lg sm:h-8 sm:w-8 ${
                  i === 0 ? "bg-mkt-accent-solid text-white shadow-[0_6px_14px_-6px_rgba(15,60,153,0.7)]" : "text-slate-400"
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            ))}
          </div>

          {/* Main */}
          <div className="min-w-0 [transform-style:preserve-3d]">
            <div className="flex items-center justify-between gap-2">
              <p className={`${DISPLAY} flex items-center gap-1 text-[13px] font-bold text-mkt-ink sm:text-base`}>
                Hiring overview <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </p>
              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-900/[0.08] px-2 py-1 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:text-slate-400 sm:text-xs">
                <CalendarDays className="h-3 w-3" /> Last 30 days
              </span>
            </div>

            {/* Stats — each card its own raised layer */}
            <div className="mt-3 grid grid-cols-3 gap-2 [transform-style:preserve-3d] sm:mt-4 sm:gap-3">
              {STATS.map((stat, i) => (
                <Layer
                  key={stat.label}
                  z={36 + i * 8}
                  className="rounded-xl border border-slate-900/[0.07] bg-mkt-surface p-2 shadow-[0_18px_30px_-18px_rgba(15,60,153,0.45)] dark:border-white/10 sm:rounded-2xl sm:p-3.5"
                >
                  <p className="truncate text-[9px] text-slate-500 dark:text-slate-400 sm:text-xs">{stat.label}</p>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 sm:mt-1">
                    <span className={`${DISPLAY} text-base font-extrabold tabular-nums tracking-[-0.02em] text-mkt-ink sm:text-2xl`}>
                      {stat.value}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-1 text-[9px] font-semibold sm:text-[11px] ${
                        stat.good ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/12 text-rose-600"
                      }`}
                    >
                      {stat.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                      {stat.delta}
                    </span>
                  </div>
                </Layer>
              ))}
            </div>

            {/* Chart + pipeline */}
            <div className="mt-2 grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-2 [transform-style:preserve-3d] sm:mt-3 sm:gap-3">
              <Layer z={28} className="relative rounded-xl border border-slate-900/[0.07] bg-mkt-surface p-2.5 shadow-[0_18px_30px_-20px_rgba(15,60,153,0.4)] dark:border-white/10 sm:rounded-2xl sm:p-4">
                <p className="text-[9px] font-semibold text-mkt-ink sm:text-xs">Shortlists per day</p>
                <div className="relative mt-2">
                  <svg viewBox="0 0 300 100" className="h-16 w-full overflow-visible sm:h-28" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="dt-area" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--mkt-cyan)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--mkt-cyan)" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="dt-line" x1="0" x2="1">
                        <stop offset="0%" stopColor="var(--mkt-accent-solid)" />
                        <stop offset="100%" stopColor="var(--mkt-cyan)" />
                      </linearGradient>
                    </defs>
                    {[25, 50, 75].map((y) => (
                      <line key={y} x1="0" x2="300" y1={y} y2={y} className="stroke-slate-900/[0.06] dark:stroke-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    <path data-area d={AREA} fill="url(#dt-area)" />
                    <path data-line d={LINE} fill="none" stroke="url(#dt-line)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {/* Peak marker, raised above the chart */}
                  <div className="pointer-events-none absolute left-[76.6%] top-[48%] [transform-style:preserve-3d]">
                    <Layer z={30} className="-translate-x-1/2 -translate-y-1/2">
                      <div data-peak className="flex flex-col items-center">
                        <span className={`${DISPLAY} mb-1 rounded-lg bg-mkt-ink px-1.5 py-0.5 text-[9px] font-bold text-mkt-canvas shadow-lg sm:px-2 sm:text-xs`}>
                          +32%
                        </span>
                        <span className="h-2.5 w-2.5 rounded-full border-2 border-mkt-surface bg-mkt-accent-solid shadow sm:h-3 sm:w-3" />
                      </div>
                    </Layer>
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between text-[8px] text-slate-400 sm:text-[11px]">
                  {DAYS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
              </Layer>

              <Layer z={52} className="rounded-xl border border-slate-900/[0.07] bg-mkt-surface p-2.5 shadow-[0_22px_34px_-20px_rgba(15,60,153,0.5)] dark:border-white/10 sm:rounded-2xl sm:p-4">
                <p className="text-[9px] font-semibold text-mkt-ink sm:text-xs">Pipeline</p>
                <svg viewBox="0 0 42 42" className="mx-auto mt-2 h-12 w-12 -rotate-90 sm:mt-3 sm:h-20 sm:w-20">
                  <circle cx="21" cy="21" r="15.915" fill="none" className="stroke-slate-900/[0.06] dark:stroke-white/10" strokeWidth="6" />
                  {PIPELINE.reduce<{ offset: number; arcs: React.ReactNode[] }>(
                    (acc, seg) => {
                      acc.arcs.push(
                        <circle
                          key={seg.label}
                          data-arc
                          cx="21"
                          cy="21"
                          r="15.915"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="6"
                          strokeDasharray={`${seg.share - 1.5} ${100 - seg.share + 1.5}`}
                          strokeDashoffset={-acc.offset}
                        />
                      );
                      acc.offset += seg.share;
                      return acc;
                    },
                    { offset: 0, arcs: [] }
                  ).arcs}
                </svg>
                <ul className="mt-2 space-y-1 sm:mt-3 sm:space-y-1.5">
                  {PIPELINE.map((seg) => (
                    <li key={seg.label} className="flex items-center justify-between gap-1 text-[8px] text-slate-600 dark:text-slate-300 sm:text-[11px]">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2" style={{ background: seg.color }} />
                        <span className="truncate">{seg.label}</span>
                      </span>
                      <span className="tabular-nums text-slate-500">{seg.share}%</span>
                    </li>
                  ))}
                </ul>
              </Layer>
            </div>
          </div>
        </div>

        {/* Floating chips — the highest layers */}
        <Layer z={110} className="absolute -top-4 right-3 sm:-top-7 sm:-right-4">
          <div data-float className="flex items-center gap-2 rounded-2xl border border-slate-900/[0.08] bg-mkt-surface/95 px-3 py-2 shadow-[0_24px_44px_-20px_rgba(15,60,153,0.55)] dark:border-white/10 sm:gap-3 sm:px-4 sm:py-3">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-mkt-accent-solid/10 text-mkt-accent sm:h-9 sm:w-9">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className={`${DISPLAY} text-[11px] font-bold leading-tight text-mkt-ink sm:text-sm`}>
              Resume
              <br />
              Scoring
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </Layer>

        <Layer z={130} className="absolute bottom-10 left-4 sm:-left-8 sm:bottom-16">
          <div data-float className="flex items-center gap-2 rounded-2xl border border-slate-900/[0.08] bg-mkt-surface/95 px-3 py-2 shadow-[0_24px_44px_-20px_rgba(15,60,153,0.55)] dark:border-white/10 sm:gap-3 sm:px-4 sm:py-3">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-mkt-accent-solid text-white sm:h-9 sm:w-9">
              <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className={`${DISPLAY} text-[11px] font-bold text-mkt-ink sm:text-sm`}>AI Interviews</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </Layer>

        <Layer z={90} className="absolute -bottom-5 right-[18%] hidden sm:block">
          <div data-float className="flex items-center gap-2 rounded-full border border-slate-900/[0.08] bg-mkt-surface/95 py-1.5 pl-1.5 pr-3.5 shadow-[0_20px_40px_-20px_rgba(15,60,153,0.5)] dark:border-white/10">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-mkt-amber/20 text-[10px] font-bold text-mkt-amber-ink">3</span>
            <span className="text-xs font-semibold text-mkt-ink">Shortlisted today</span>
          </div>
        </Layer>
      </div>
    </div>
  );
}
