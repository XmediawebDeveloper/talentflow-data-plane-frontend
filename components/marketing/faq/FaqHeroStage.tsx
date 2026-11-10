"use client";

import { useEffect, useRef } from "react";

/**
 * FAQ hero: F · A · Q assemble from broken pieces → a question mark and a
 * magnifier cross behind the word → the word lifts away and the pair holds
 * its own beat → a tick lands ("Answered") and holds before the loop.
 *
 * One 12 s loop (1% = 0.12 s), every stage waits for the one before it:
 *   0.0–2.6 s  shards fly in on one glide, seat with a soft overshoot
 *   2.7–3.6 s  seams flash, underline sweeps
 *   3.1–4.1 s  ? and magnifier cross in behind the word; lens, stem, spark draw
 *   4.6–5.2 s  word lifts away; the pair holds alone until 6.7 s
 *   7.0–7.7 s  tick lands with one bounce, check draws, ripple
 *   7.7–11.3 s hold, then a short fade into the next loop
 * The loop only runs while the stage is on screen.
 */
const LOOP = "12s";

const CSS = `
.fqh-stage { --fqh-ink: #08132e; --fqh-guide: rgba(8,19,46,.08); --fqh-line: rgba(8,19,46,.08); --fqh-cap-bg: #fff;
  position: relative; width: 100%; height: 420px; display: flex; align-items: center; justify-content: center; perspective: 1200px; }
.dark .fqh-stage { --fqh-ink: #e8eefc; --fqh-guide: rgba(255,255,255,.08); --fqh-line: rgba(255,255,255,.12); --fqh-cap-bg: #0f1b38; }
.fqh-stage.is-paused * { animation-play-state: paused !important; }

.fqh-halo { position: absolute; inset: 10% 8%; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, rgba(7,156,196,.13), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.07), transparent 82%); }
.fqh-shadow { position: absolute; left: 50%; bottom: 54px; width: 300px; height: 52px; margin-left: -150px; border-radius: 50%;
  pointer-events: none; filter: blur(10px); background: radial-gradient(closest-side, rgba(8,19,46,.16), transparent 74%); }
.dark .fqh-shadow { background: radial-gradient(closest-side, rgba(0,0,0,.45), transparent 74%); }

.fqh-scene { position: relative; flex: none; width: 420px; height: 300px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--fqh-scale, 1)) rotateY(var(--ry, 0deg)) rotateX(var(--rx, 0deg)); }

/* ---- stage 1: the word ---- */
/* glyphs render ~29px below their box top, so lift the row to sit optically centred above the underline */
.fqh-word { position: absolute; inset: -24px 0 24px; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 10px;
  perspective: 900px; transform-style: preserve-3d; pointer-events: none; animation: fqh-wordOut ${LOOP} ease-in-out infinite; }
@keyframes fqh-wordOut {
  0%, 38% { opacity: 1; transform: translateY(0) scale(1); }
  43%, 100% { opacity: 0; transform: translateY(-16px) scale(.95); }
}
.fqh-glyph { position: relative; display: block; width: 64px; height: 104px; font-family: var(--font-display), Inter, system-ui, sans-serif;
  font-size: 104px; font-weight: 800; line-height: 1; color: var(--fqh-ink); transform-style: preserve-3d; }
.fqh-glyph.A { width: 82px; } .fqh-glyph.Q { width: 90px; }
.fqh-glyph::before { content: attr(data-ch); position: absolute; left: -8px; top: 29px; line-height: 1; color: var(--fqh-guide); }

/* each shard is the whole letter clipped to one slice, so slices rebuild it exactly */
.fqh-shard { position: absolute; left: -8px; top: 29px; width: 108px; height: 103px; font: inherit; line-height: inherit; color: var(--fqh-ink);
  white-space: pre; clip-path: polygon(var(--c)); backface-visibility: hidden; will-change: transform, opacity;
  animation: fqh-shardIn ${LOOP} linear infinite; animation-delay: var(--lag, 0s); }
.F .s1 { --c: 0 0, 100% 0, 100% 30px, 0 30px; --dx: -140px; --dy: -110px; }
.F .s2 { --c: 0 30px, 100% 30px, 100% 58px, 0 58px; --dx: 130px; --dy: -60px; --lag: .1s; }
.F .s3 { --c: 0 58px, 100% 58px, 100% 104px, 0 104px; --dx: -110px; --dy: 130px; --lag: .2s; }
.A .s1 { --c: 0 0, 100% 0, 100% 44px, 0 44px; --dx: 0px; --dy: -150px; --lag: .08s; }
.A .s2 { --c: 0 44px, 52% 44px, 52% 104px, 0 104px; --dx: -150px; --dy: 90px; --lag: .18s; }
.A .s3 { --c: 52% 44px, 100% 44px, 100% 104px, 52% 104px; --dx: 150px; --dy: 90px; --lag: .28s; }
.Q .s1 { --c: 0 0, 100% 0, 100% 78px, 0 78px; --dx: -20px; --dy: -150px; --lag: .16s; }
.Q .s2 { --c: 40% 70px, 100% 70px, 100% 104px, 40% 104px; --dx: 130px; --dy: 110px; --lag: .3s; }
.s1 { --rot: -38deg; --flip: 100deg; } .s2 { --rot: 32deg; --flip: -95deg; } .s3 { --rot: -48deg; --flip: 110deg; }

/* one continuous glide: fly 0–17%, overshoot a hair at 19%, lock at 21% (≈2.5 s) and hold */
@keyframes fqh-shardIn {
  0% { opacity: 0; transform: translate3d(var(--dx), var(--dy), -240px) rotate(var(--rot)) rotateY(var(--flip)) scale(.55);
    animation-timing-function: cubic-bezier(.16,.8,.28,1); }
  3% { opacity: 1; transform: translate3d(calc(var(--dx) * .9), calc(var(--dy) * .9), -190px) rotate(calc(var(--rot) * .8)) rotateY(calc(var(--flip) * .8)) scale(.62);
    animation-timing-function: cubic-bezier(.2,.85,.3,1); }
  14% { opacity: 1; transform: translate3d(calc(var(--dx) * .2), calc(var(--dy) * .2), 22px) rotate(calc(var(--rot) * -.08)) rotateY(12deg) scale(.97);
    animation-timing-function: cubic-bezier(.3,.9,.4,1); }
  19% { opacity: 1; transform: translate3d(0,0,0) rotate(0) rotateY(0) scale(1.012); animation-timing-function: cubic-bezier(.4,0,.2,1); }
  21%, 100% { opacity: 1; transform: translate3d(0,0,0) rotate(0) rotateY(0) scale(1); }
}

.fqh-seam { position: absolute; left: -6%; width: 112%; height: 2px; top: var(--sy); border-radius: 2px; opacity: 0;
  background: linear-gradient(90deg, rgba(7,156,196,0), #fff, rgba(7,156,196,0)); animation: fqh-seam ${LOOP} ease-out infinite; }
.dark .fqh-seam { background: linear-gradient(90deg, rgba(7,156,196,0), #7fdcf3, rgba(7,156,196,0)); }
.F .fqh-seam { --sy: 30px; } .A .fqh-seam { --sy: 44px; animation-delay: .1s; } .Q .fqh-seam { --sy: 74px; animation-delay: .2s; }
@keyframes fqh-seam { 0%, 22.5% { opacity: 0; transform: scaleX(.3); } 24% { opacity: 1; transform: scaleX(1); } 27.5%, 100% { opacity: 0; transform: scaleX(1); } }

.fqh-rule { position: absolute; z-index: 6; left: 50%; top: 50%; width: 300px; height: 5px; margin: 62px 0 0 -150px; border-radius: 999px; opacity: 0;
  pointer-events: none; background: linear-gradient(90deg, rgba(15,60,153,0), #0f3c99, rgba(7,156,196,0));
  animation: fqh-rule ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
.dark .fqh-rule { background: linear-gradient(90deg, rgba(76,123,232,0), #4c7be8, rgba(7,156,196,0)); }
@keyframes fqh-rule { 0%, 23% { opacity: 0; transform: scaleX(.1); } 29% { opacity: 1; transform: scaleX(1); } 37% { opacity: 1; transform: scaleX(1); } 41%, 100% { opacity: 0; transform: scaleX(1); } }

/* ---- stage 2: ? + magnifier cross in behind the word, then hold alone ---- */
.fqh-pair { position: absolute; inset: 0; z-index: 1; opacity: 0; pointer-events: none; transform-origin: 50% 50%;
  animation: fqh-pair ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes fqh-pair {
  0%, 25% { opacity: 0; transform: scale(.14) rotate(-8deg); filter: blur(4px); }
  29% { opacity: .55; transform: scale(.7) rotate(-4deg); filter: blur(0); }
  33% { opacity: .95; transform: scale(1.05) rotate(0); }
  36% { opacity: .95; transform: scale(1); }
  41% { opacity: .95; transform: scale(1); }
  46% { opacity: 1; transform: scale(1.06); }          /* word gone: the pair steps forward */
  53% { opacity: 1; transform: scale(1.06); }
  57%, 100% { opacity: 0; transform: scale(1.12); }
}
.fqh-q, .fqh-glass { position: absolute; left: 50%; top: 50%; }
.fqh-q { font-family: var(--font-display), Inter, system-ui, sans-serif; font-size: 104px; font-weight: 800; line-height: 1; letter-spacing: -.05em;
  color: var(--fqh-ink); margin: -58px 0 0 -62px; animation: fqh-q ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes fqh-q {
  0%, 25% { transform: translate(-46px,-40px) rotate(-34deg) scale(.7); opacity: 0; }
  29% { transform: translate(-22px,-20px) rotate(-18deg) scale(.92); opacity: 1; }
  33.5% { transform: translate(-28px,-12px) rotate(-17deg) scale(1.02); }
  36.5%, 100% { transform: translate(-30px,-14px) rotate(-16deg) scale(1); }
}
.fqh-glass { width: 112px; height: 112px; margin: -56px 0 0 -56px; animation: fqh-glass ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes fqh-glass {
  0%, 26% { transform: translate(48px,44px) rotate(32deg) scale(.7); opacity: 0; }
  30% { transform: translate(24px,22px) rotate(12deg) scale(.92); opacity: 1; }
  34.5% { transform: translate(28px,12px) rotate(18deg) scale(1.02); }
  37.5%, 100% { transform: translate(30px,14px) rotate(16deg) scale(1); }
}
.fqh-pair-halo { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; margin: -150px 0 0 -150px; border-radius: 50%; filter: blur(14px);
  background: radial-gradient(closest-side, rgba(7,156,196,.2), transparent 72%), radial-gradient(closest-side, rgba(15,60,153,.1), transparent 84%);
  animation: fqh-halo ${LOOP} ease-in-out infinite; }
@keyframes fqh-halo { 0%, 27% { transform: scale(.7); opacity: 0; } 35% { transform: scale(1); opacity: 1; } 53% { transform: scale(1.08); opacity: 1; } 57%, 100% { transform: scale(1.12); opacity: 0; } }
.fqh-lens { position: absolute; left: 0; top: 0; width: 70px; height: 70px; border-radius: 50%; border: 7px solid var(--fqh-ink); opacity: 0;
  background: radial-gradient(circle at 34% 30%, rgba(7,156,196,.16), rgba(15,60,153,.05) 64%, rgba(255,255,255,.15));
  animation: fqh-lens ${LOOP} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes fqh-lens { 0%, 30.5% { opacity: 0; transform: scale(.55) rotate(-28deg); } 33.5% { opacity: 1; transform: scale(1.05) rotate(4deg); } 35.5%, 100% { opacity: 1; transform: scale(1) rotate(0); } }
.fqh-stem { position: absolute; left: 63px; top: 63px; width: 34px; height: 8px; border-radius: 999px; background: var(--fqh-ink);
  transform-origin: 0 50%; transform: rotate(45deg) scaleX(0); animation: fqh-stem ${LOOP} cubic-bezier(.34,1.56,.64,1) infinite; }
@keyframes fqh-stem { 0%, 33% { transform: rotate(45deg) scaleX(0); } 36.5% { transform: rotate(45deg) scaleX(1.1); } 38.5%, 100% { transform: rotate(45deg) scaleX(1); } }
.fqh-spark { position: absolute; left: 58px; top: 2px; width: 9px; height: 9px; border-radius: 50%; background: #079cc4; opacity: 0;
  animation: fqh-spark ${LOOP} ease-out infinite; }
@keyframes fqh-spark { 0%, 34% { opacity: 0; transform: translate(0,0) scale(.5); } 35.2% { opacity: 1; transform: translate(6px,-6px) scale(1); } 39%, 100% { opacity: 0; transform: translate(20px,-18px) scale(.3); } }

/* ---- stage 3: the tick ---- */
.fqh-tick { position: absolute; inset: 0; z-index: 8; display: grid; place-items: center; opacity: 0; pointer-events: none;
  animation: fqh-tick ${LOOP} linear infinite; }
@keyframes fqh-tick {
  0%, 58% { opacity: 0; transform: scale(.62); animation-timing-function: cubic-bezier(.22,1,.36,1); }
  61.5% { opacity: 1; transform: scale(1.1); animation-timing-function: ease-in-out; }
  63.5% { transform: scale(.97); animation-timing-function: ease-out; }
  65.5%, 94% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
  100% { opacity: 0; transform: scale(1.04); }
}
.fqh-tick-circle { position: absolute; width: 150px; height: 150px; border-radius: 50%; border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(165deg, #0b1734 0%, #08132e 54%, #0d2148 100%);
  box-shadow: 0 1px 0 rgba(255,255,255,.16) inset, 0 34px 58px -28px rgba(8,31,92,.7); }
.dark .fqh-tick-circle { border-color: rgba(255,255,255,.2); box-shadow: 0 1px 0 rgba(255,255,255,.2) inset, 0 0 0 6px rgba(75,207,154,.08), 0 34px 58px -28px rgba(0,0,0,.8); }
.fqh-ripple { position: absolute; width: 150px; height: 150px; border-radius: 50%; border: 2px solid rgba(75,207,154,.5); opacity: 0;
  animation: fqh-ripple ${LOOP} ease-out infinite; }
@keyframes fqh-ripple { 0%, 60.5% { opacity: 0; transform: scale(1); } 61.5% { opacity: .9; } 68%, 100% { opacity: 0; transform: scale(1.55); } }
.fqh-tick svg { position: relative; }
.fqh-tick-path { stroke-dasharray: 60; stroke-dashoffset: 60; animation: fqh-draw ${LOOP} ease-out infinite; }
@keyframes fqh-draw { 0%, 61% { stroke-dashoffset: 60; } 66%, 94% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 60; } }
.fqh-caption { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 12px; border-radius: 999px; white-space: nowrap; background: var(--fqh-cap-bg); border: 1px solid var(--fqh-line);
  box-shadow: 0 12px 22px -16px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--fqh-ink); }
.fqh-caption i { width: 6px; height: 6px; border-radius: 50%; background: #14a06a; }

@media (max-width: 1279px) { .fqh-stage { height: 400px; } .fqh-scene { --fqh-scale: .92; } }
@media (max-width: 1023px) { .fqh-stage { height: 360px; } .fqh-scene { --fqh-scale: .86; } }
@media (max-width: 620px) { .fqh-stage { height: 250px; } .fqh-scene { --fqh-scale: .74; } .fqh-shadow { bottom: 18px; } }
@media (max-width: 400px) { .fqh-stage { height: 230px; } .fqh-scene { --fqh-scale: .68; } }

@media (prefers-reduced-motion: reduce) {
  .fqh-stage *, .fqh-stage *::before { animation: none !important; }
  .fqh-word, .fqh-pair, .fqh-rule { opacity: 0; }
  .fqh-tick { opacity: 1; transform: none; }
  .fqh-tick-path { stroke-dashoffset: 0; }
}
`;

export function FaqHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene) return;

    // Run the loop only while it is visible (pauses off-screen, resumes where it left off).
    const io = new IntersectionObserver(([entry]) => {
      stage.classList.toggle("is-paused", !entry.isIntersecting);
    }, { threshold: 0.15 });
    io.observe(stage);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => io.disconnect();

    // Gentle pointer tilt (desktop).
    let tx = 0, ty = 0, cx = 0, cy = 0;
    let frame: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      scene.style.setProperty("--ry", `${cx.toFixed(2)}deg`);
      scene.style.setProperty("--rx", `${cy.toFixed(2)}deg`);
      frame = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 10;
      ty = -((e.clientY - r.top) / r.height - 0.5) * 10;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
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
      className="fqh-stage"
      role="img"
      aria-label="The letters F, A and Q come together, a question mark and magnifying glass appear, then a tick marks the question answered"
    >
      <style>{CSS}</style>
      <div className="fqh-halo" aria-hidden="true" />
      <div className="fqh-shadow" aria-hidden="true" />

      <div ref={sceneRef} className="fqh-scene" aria-hidden="true">
        <div className="fqh-word">
          <span className="fqh-glyph F" data-ch="F">
            <span className="fqh-shard s1">F</span>
            <span className="fqh-shard s2">F</span>
            <span className="fqh-shard s3">F</span>
            <span className="fqh-seam" />
          </span>
          <span className="fqh-glyph A" data-ch="A">
            <span className="fqh-shard s1">A</span>
            <span className="fqh-shard s2">A</span>
            <span className="fqh-shard s3">A</span>
            <span className="fqh-seam" />
          </span>
          <span className="fqh-glyph Q" data-ch="Q">
            <span className="fqh-shard s1">Q</span>
            <span className="fqh-shard s2">Q</span>
            <span className="fqh-seam" />
          </span>
        </div>
        <span className="fqh-rule" />

        <div className="fqh-pair">
          <span className="fqh-pair-halo" />
          <span className="fqh-q">?</span>
          <span className="fqh-glass">
            <span className="fqh-lens" />
            <span className="fqh-stem" />
            <span className="fqh-spark" />
          </span>
        </div>

        <div className="fqh-tick">
          <span className="fqh-ripple" />
          <span className="fqh-tick-circle" />
          <svg width="82" height="82" viewBox="0 0 48 48" fill="none">
            <path className="fqh-tick-path" d="M13 25.5 20.5 33 36 16" stroke="#4bcf9a" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="fqh-caption"><i /> Answered</span>
        </div>
      </div>
    </div>
  );
}
