"use client";

import { useEffect, useRef } from "react";

/**
 * About hero: a small AI robot wakes, beams a spinning asterisk onto a résumé
 * and a job suitcase, both "process", and a MATCHED stamp lands across them.
 *
 * One 12 s loop (1% = 0.12 s):
 *   0.0–0.7 s  robot, résumé and suitcase drop in
 *   2.6–3.4 s  arm points, beam to the résumé; asterisk spins onto it, lines fill
 *   3.6–4.3 s  second beam; asterisk hops to the suitcase
 *   5.5–7.0 s  name tag drops onto the case, its light turns green
 *   7.4–8.6 s  MATCHED stamp hits with sparks, holds
 *   10.1–12 s  everything lifts away and the loop restarts
 * Beams are drawn in scene coordinates (arm tip → each object's centre),
 * so nothing is measured per frame. The loop pauses while off-screen.
 */
const LOOP = "12s";

/* arm tip (150,180) → résumé centre (308,145) and suitcase centre (319,289) */
const BEAMS = [
  { len: 162, ang: -12.5, cls: "b1" },
  { len: 201, ang: 32.8, cls: "b2" },
];
const SPARKS = [
  { x: 290, y: 200, sx: -26, sy: -22 },
  { x: 342, y: 200, sx: 24, sy: -18 },
  { x: 290, y: 264, sx: -24, sy: 20 },
  { x: 342, y: 264, sx: 26, sy: 18 },
];

const CSS = `
.ahs-stage { --ahs-ink: #08132e; position: relative; width: 100%; height: 470px; display: flex; align-items: center; justify-content: center;
  perspective: 1400px; perspective-origin: 50% 48%; }
.ahs-stage.is-paused * { animation-play-state: paused !important; }
.ahs-halo { position: absolute; inset: 6% 4% 4%; border-radius: 50%; pointer-events: none; filter: blur(9px);
  background: radial-gradient(closest-side, rgba(7,156,196,.14), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.07), transparent 82%); }
.ahs-floor { position: absolute; left: 50%; bottom: 54px; width: 420px; height: 70px; margin-left: -210px; border-radius: 50%; pointer-events: none;
  filter: blur(11px); background: radial-gradient(closest-side, rgba(8,19,46,.16), transparent 74%); }
.dark .ahs-floor { background: radial-gradient(closest-side, rgba(0,0,0,.45), transparent 74%); }

.ahs-scene { position: relative; flex: none; width: 500px; height: 400px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--ahs-scale, 1)) rotateX(var(--rx, 3deg)) rotateY(var(--ry, -10deg)); }

/* ---- robot ---- */
.ahs-robot { position: absolute; left: 26px; top: 118px; width: 108px; height: 150px; transform-origin: 50% 100%;
  animation: ahs-robot ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes ahs-robot {
  0% { transform: translateY(22px) rotate(-6deg) scale(.86); opacity: 0; }
  6% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
  20%, 34% { transform: translateY(0) rotate(0) scale(1); }
  40% { transform: translateY(-4px) rotate(7deg) scale(1.03); }
  52%, 78% { transform: translateY(0) rotate(3deg) scale(1); }
  86% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
  96%, 100% { transform: translateY(22px) rotate(-6deg) scale(.86); opacity: 0; }
}
.ahs-head { position: relative; width: 100%; height: 84px; border-radius: 24px; border: 2px solid rgba(8,19,46,.1);
  background: linear-gradient(165deg, #f4f7fd 0%, #e6ecf7 58%, #d8e2f1 100%);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 18px 30px -18px rgba(8,31,92,.5); }
.ahs-antenna { position: absolute; left: 50%; top: -26px; width: 3px; height: 26px; margin-left: -1.5px; border-radius: 2px; background: rgba(8,19,46,.35); }
.dark .ahs-antenna { background: rgba(255,255,255,.35); }
.ahs-antenna::after { content: ""; position: absolute; left: 50%; top: -9px; width: 11px; height: 11px; margin-left: -5.5px; border-radius: 50%;
  background: #079cc4; box-shadow: 0 0 10px rgba(7,156,196,.8); animation: ahs-blink 1.6s ease-in-out infinite; }
@keyframes ahs-blink { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }
.ahs-face { position: absolute; inset: 14px 12px 12px; border-radius: 16px; background: linear-gradient(180deg, #0b1734, #08132e);
  display: grid; place-items: center; overflow: hidden; }
.ahs-eyes { display: flex; gap: 14px; animation: ahs-scan 3.4s ease-in-out infinite; }
@keyframes ahs-scan { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-4px); } 60% { transform: translateX(4px); } }
.ahs-eye { width: 13px; height: 13px; border-radius: 50%; background: #6fe3ff;
  box-shadow: 0 0 12px rgba(111,227,255,.95), 0 0 26px rgba(7,156,196,.6); animation: ahs-pulse 2.4s ease-in-out infinite; }
.ahs-eye + .ahs-eye { animation-delay: .18s; }
@keyframes ahs-pulse { 0%, 100% { transform: scaleY(1); opacity: 1; } 48% { transform: scaleY(.15); opacity: .75; } 52% { transform: scaleY(1); opacity: 1; } }
.ahs-mouth { position: absolute; left: 50%; bottom: 9px; width: 34px; height: 5px; margin-left: -17px; border-radius: 3px;
  background: repeating-linear-gradient(90deg, rgba(111,227,255,.75) 0 3px, transparent 3px 6px); }
.ahs-body { position: relative; width: 74px; height: 48px; margin: 6px auto 0; border-radius: 16px 16px 20px 20px;
  background: linear-gradient(165deg, #f4f7fd, #dde5f2); border: 2px solid rgba(8,19,46,.1); box-shadow: 0 14px 24px -16px rgba(8,31,92,.5); }
.ahs-body::after { content: ""; position: absolute; left: 50%; top: 12px; width: 26px; height: 26px; margin-left: -13px; border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #6fe3ff, #0f3c99 70%); box-shadow: 0 0 12px rgba(7,156,196,.6); }
.ahs-arm { position: absolute; right: -16px; top: 62px; width: 34px; height: 8px; border-radius: 5px; transform-origin: 0 50%;
  background: linear-gradient(90deg, #dde5f2, #c6d1e4); border: 1.5px solid rgba(8,19,46,.1); animation: ahs-arm ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes ahs-arm { 0%, 18% { transform: rotate(52deg); } 24%, 50% { transform: rotate(-6deg); } 60%, 100% { transform: rotate(52deg); } }

/* ---- beams + asterisk ---- */
.ahs-beam { position: absolute; left: 150px; top: 180px; height: 2px; border-radius: 2px; transform-origin: 0 50%; opacity: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(7,156,196,0), rgba(7,156,196,.9), rgba(237,136,28,0)); }
.ahs-beam.b1 { animation: ahs-beam1 ${LOOP} ease-out infinite; }
.ahs-beam.b2 { animation: ahs-beam2 ${LOOP} ease-out infinite; }
@keyframes ahs-beam1 { 0%, 21% { opacity: 0; clip-path: inset(0 100% 0 0); } 27% { opacity: 1; clip-path: inset(0 0 0 0); } 38% { opacity: .85; clip-path: inset(0 0 0 0); } 44%, 100% { opacity: 0; clip-path: inset(0 0 0 0); } }
@keyframes ahs-beam2 { 0%, 30% { opacity: 0; clip-path: inset(0 100% 0 0); } 36% { opacity: 1; clip-path: inset(0 0 0 0); } 46% { opacity: .85; clip-path: inset(0 0 0 0); } 52%, 100% { opacity: 0; clip-path: inset(0 0 0 0); } }
.ahs-asterisk { position: absolute; left: 0; top: 0; width: 54px; height: 54px; margin: -27px 0 0 -27px; opacity: 0; pointer-events: none; color: #ed881c;
  filter: drop-shadow(0 0 10px rgba(237,136,28,.7)); z-index: 4; animation: ahs-fly ${LOOP} cubic-bezier(.5,0,.5,1) infinite; }
@keyframes ahs-fly {
  0%, 20% { opacity: 0; transform: translate(150px,180px) rotate(0) scale(.5); }
  24% { opacity: 1; transform: translate(156px,176px) rotate(60deg) scale(.9); }
  33% { opacity: 1; transform: translate(308px,145px) rotate(220deg) scale(1.2); }
  43% { opacity: 1; transform: translate(308px,145px) rotate(340deg) scale(1.1); }
  52% { opacity: 1; transform: translate(319px,262px) rotate(470deg) scale(1.2); }
  60% { opacity: 1; transform: translate(319px,262px) rotate(570deg) scale(1.05); }
  64%, 100% { opacity: 0; transform: translate(316px,232px) rotate(620deg) scale(.4); }  /* folds into the stamp */
}

/* ---- résumé ---- */
.ahs-resume { position: absolute; left: 244px; top: 62px; width: 128px; height: 166px; padding: 11px 11px 10px; border-radius: 10px; background: #fff;
  border: 1px solid rgba(8,19,46,.09); transform-origin: 50% 100%;
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 26px 40px -24px rgba(8,31,92,.5), 0 5px 12px -7px rgba(8,31,92,.18);
  animation: ahs-resume ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes ahs-resume {
  0% { transform: translateY(-46px) rotate(-9deg) scale(.92); opacity: 0; }
  6% { transform: translateY(0) rotate(-2deg) scale(1); opacity: 1; }
  16% { transform: translateY(0) rotate(1.5deg) scale(1); }
  28%, 84% { transform: translateY(-2px) rotate(0) scale(1.01); opacity: 1; }
  94%, 100% { transform: translateY(-30px) rotate(6deg) scale(.94); opacity: 0; }
}
.ahs-r-top { display: flex; align-items: center; gap: 7px; }
.ahs-photo { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; color: #fff; font-size: 10px; font-weight: 800;
  background: linear-gradient(145deg, #0f3c99, #079cc4); }
.ahs-name { width: 52px; height: 6px; border-radius: 3px; background: rgba(8,19,46,.32); }
.ahs-role { width: 38px; height: 4px; margin-top: 4px; border-radius: 3px; background: rgba(8,19,46,.14); }
.ahs-lines { margin-top: 11px; display: grid; gap: 6px; }
.ahs-lines i { display: block; height: 4px; border-radius: 3px; transform-origin: left center; transform: scaleX(0);
  background: linear-gradient(90deg, rgba(15,60,153,.55), rgba(7,156,196,.4)); animation: ahs-fill ${LOOP} ease-out infinite; }
.ahs-lines i:nth-child(1) { width: 96%; animation-delay: .06s; } .ahs-lines i:nth-child(2) { width: 84%; animation-delay: .14s; }
.ahs-lines i:nth-child(3) { width: 92%; animation-delay: .22s; } .ahs-lines i:nth-child(4) { width: 70%; animation-delay: .3s; }
.ahs-lines i:nth-child(5) { width: 88%; animation-delay: .38s; }
@keyframes ahs-fill { 0%, 30% { transform: scaleX(0); } 40%, 86% { transform: scaleX(1); } 93%, 100% { transform: scaleX(0); } }
.ahs-tags { display: flex; gap: 4px; margin-top: 10px; }
.ahs-tags span { padding: 2px 6px; border-radius: 5px; background: rgba(15,60,153,.09); color: #14397f; font-size: 8px; font-weight: 700; }

/* ---- suitcase ---- */
.ahs-case { position: absolute; left: 244px; top: 236px; width: 150px; height: 106px; transform-origin: 50% 100%;
  animation: ahs-case ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes ahs-case {
  0%, 4% { transform: translateY(34px) rotate(4deg) scale(.92); opacity: 0; }
  11% { transform: translateY(0) rotate(1deg) scale(1); opacity: 1; }
  20%, 84% { transform: translateY(0) rotate(-1deg) scale(1); opacity: 1; }
  94%, 100% { transform: translateY(24px) rotate(-5deg) scale(.94); opacity: 0; }
}
.ahs-handle { position: absolute; left: 50%; top: -14px; width: 46px; height: 20px; margin-left: -23px; border: 4px solid #1c2c4e; border-bottom: 0; border-radius: 10px 10px 0 0; }
.dark .ahs-handle { border-color: #50648f; }
.ahs-case-body { position: absolute; inset: 0; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(165deg, #1e3157 0%, #132244 56%, #0d1a36 100%);
  box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 28px 46px -26px rgba(8,31,92,.72); }
.ahs-case-body::before, .ahs-case-body::after { content: ""; position: absolute; top: 16px; width: 14px; height: 7px; border-radius: 2px;
  background: #d8b05a; box-shadow: 0 1px 0 rgba(255,255,255,.4) inset; }
.ahs-case-body::before { left: 20px; } .ahs-case-body::after { right: 20px; }
.ahs-lid { position: absolute; left: 0; right: 0; top: 26px; height: 2px; background: rgba(255,255,255,.12); }
.ahs-light { position: absolute; right: 12px; top: 12px; width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.28);
  animation: ahs-light ${LOOP} steps(1) infinite; }
@keyframes ahs-light { 0%, 53% { background: rgba(255,255,255,.28); box-shadow: none; } 54%, 88% { background: #4bcf9a; box-shadow: 0 0 10px rgba(75,207,154,.9); } 90%, 100% { background: rgba(255,255,255,.28); box-shadow: none; } }
.ahs-tag { position: absolute; left: 50%; bottom: 16px; width: 88px; height: 26px; margin-left: -44px; border-radius: 6px; background: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800; color: #08132e; transform-origin: 50% 0;
  box-shadow: 0 8px 16px -10px rgba(0,0,0,.6); animation: ahs-tag ${LOOP} cubic-bezier(.34,1.56,.64,1) infinite; }
@keyframes ahs-tag {
  0%, 46% { transform: translateY(-16px) rotate(-8deg) scale(.7); opacity: 0; }
  53% { transform: translateY(0) rotate(-2deg) scale(1.04); opacity: 1; }
  57%, 88% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
  94%, 100% { transform: translateY(-14px) rotate(6deg) scale(.8); opacity: 0; }
}

/* ---- stamp across both objects ---- */
.ahs-stamp { position: absolute; left: 316px; top: 232px; width: 118px; height: 118px; margin: -59px 0 0 -59px; border-radius: 50%; z-index: 5;
  border: 4px solid #14a06a; background: rgba(240,252,246,.82); color: #0b6b42; display: grid; place-items: center;
  font-family: var(--font-display), Inter, system-ui, sans-serif; font-size: 13px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
  box-shadow: 0 14px 30px -16px rgba(20,160,106,.6); opacity: 0; pointer-events: none; animation: ahs-stamp ${LOOP} cubic-bezier(.34,1.56,.64,1) infinite; }
.dark .ahs-stamp { background: rgba(10,40,30,.85); color: #6fe0ae; border-color: #3cc48a; }
@keyframes ahs-stamp {
  0%, 61.5% { opacity: 0; transform: scale(2.2) rotate(-24deg); }
  66.5% { opacity: 1; transform: scale(.93) rotate(-9deg); }
  70%, 86% { opacity: 1; transform: scale(1) rotate(-11deg); }
  92%, 100% { opacity: 0; transform: scale(1.12) rotate(-11deg); }
}
.ahs-spark { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #14a06a; opacity: 0; pointer-events: none; z-index: 6;
  animation: ahs-spark ${LOOP} ease-out infinite; }
@keyframes ahs-spark { 0%, 66% { opacity: 0; transform: translate(0,0) scale(.4); } 68% { opacity: 1; transform: translate(0,0) scale(1); } 76%, 100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(.3); } }

@media (max-width: 1279px) { .ahs-stage { height: 440px; } .ahs-scene { --ahs-scale: .92; } }
@media (max-width: 1023px) { .ahs-stage { height: 400px; } .ahs-scene { --ahs-scale: .86; } }
/* phones: almost straight-on (the desktop side-tilt shifts it sideways), scaled to the column */
@media (max-width: 639px) {
  .ahs-stage { height: 300px; perspective: 2400px; } .ahs-floor { bottom: 26px; width: 300px; margin-left: -150px; }
  /* artwork spans x 26–394 of the 500px scene: shift +40 so it sits optically centred */
  .ahs-scene { transform: scale(.78) translateX(40px) rotateX(2deg) rotateY(-3deg) !important; }
}
@media (max-width: 400px) { .ahs-stage { height: 280px; } .ahs-scene { transform: scale(.72) translateX(40px) rotateX(2deg) rotateY(-3deg) !important; } }

@media (prefers-reduced-motion: reduce) {
  .ahs-stage *, .ahs-stage *::before, .ahs-stage *::after { animation: none !important; }
  .ahs-robot, .ahs-resume, .ahs-case, .ahs-tag { opacity: 1; transform: none; }
  .ahs-lines i { transform: scaleX(1); }
  .ahs-asterisk, .ahs-beam, .ahs-spark { opacity: 0; }
  .ahs-stamp { opacity: 1; transform: rotate(-11deg); }
}
`;

export function AboutHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene) return;

    const io = new IntersectionObserver(([e]) => stage.classList.toggle("is-paused", !e.isIntersecting), { threshold: 0.15 });
    io.observe(stage);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => io.disconnect();

    // Gentle pointer tilt around the resting angle (mouse only).
    let tx = 3, ty = -10, cx = 3, cy = -10;
    let frame: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      scene.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      scene.style.setProperty("--ry", `${cy.toFixed(2)}deg`);
      frame = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      ty = -10 + ((e.clientX - r.left) / r.width - 0.5) * 14;
      tx = 3 - ((e.clientY - r.top) / r.height - 0.5) * 10;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 3;
      ty = -10;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      io.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="ahs-stage"
      role="img"
      aria-label="An AI robot beams an asterisk onto a résumé and a job suitcase, then stamps them as matched"
    >
      <style>{CSS}</style>
      <div className="ahs-halo" aria-hidden="true" />
      <div className="ahs-floor" aria-hidden="true" />

      <div ref={sceneRef} className="ahs-scene" aria-hidden="true">
        {BEAMS.map((b) => (
          <span key={b.cls} className={`ahs-beam ${b.cls}`} style={{ width: b.len, transform: `rotate(${b.ang}deg)` }} />
        ))}

        <div className="ahs-robot">
          <div className="ahs-antenna" />
          <div className="ahs-head">
            <div className="ahs-face">
              <div className="ahs-eyes"><span className="ahs-eye" /><span className="ahs-eye" /></div>
              <div className="ahs-mouth" />
            </div>
          </div>
          <div className="ahs-body" />
          <div className="ahs-arm" />
        </div>

        <svg className="ahs-asterisk" viewBox="0 0 48 48" fill="none">
          <path d="M24 6v36M8.8 15l30.4 18M39.2 15 8.8 33" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </svg>

        <div className="ahs-resume">
          <div className="ahs-r-top">
            <span className="ahs-photo">AR</span>
            <div><div className="ahs-name" /><div className="ahs-role" /></div>
          </div>
          <div className="ahs-lines"><i /><i /><i /><i /><i /></div>
          <div className="ahs-tags"><span>React</span><span>6 yrs</span></div>
        </div>

        <div className="ahs-case">
          <div className="ahs-handle" />
          <div className="ahs-case-body">
            <div className="ahs-lid" />
            <span className="ahs-light" />
          </div>
          <div className="ahs-tag">Senior React Eng</div>
        </div>

        <div className="ahs-stamp">Matched</div>
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="ahs-spark"
            style={{ left: s.x, top: s.y, ["--sx" as string]: `${s.sx}px`, ["--sy" as string]: `${s.sy}px` }}
          />
        ))}
      </div>
    </div>
  );
}
