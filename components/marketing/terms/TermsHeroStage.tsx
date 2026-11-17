"use client";

import { useEffect, useRef } from "react";

/**
 * Terms hero — an agreement in 3D. Its clauses tick off one by one, a pen
 * writes the signature, then an "Agreed" stamp lands and the status flips to
 * Accepted. The scene tilts towards the pointer. 7 s loop.
 *
 * Clause labels only restate the Terms; nothing new is promised.
 */

const CYCLE_S = "7s";

const CLAUSES = ["Use TalentFlow lawfully", "Keep your account secure", "Respect TalentFlow's IP"];

// The signature, drawn left to right; the pen follows these points.
const SIGNATURE =
  "M4 30C12 8 22 8 22 26C22 36 32 34 38 22C44 10 52 10 54 26C56 36 66 30 74 20C82 10 90 16 92 28C94 36 108 30 120 22C134 14 148 20 164 18";

export function TermsHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 6, ty = -14, cx = 6, cy = -14;
    let frame: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      scene.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      scene.style.setProperty("--ry", `${cy.toFixed(2)}deg`);
      frame = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = 6 - ((e.clientY - r.top) / r.height - 0.5) * 12;
      ty = -14 + ((e.clientX - r.left) / r.width - 0.5) * 18;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 6;
      ty = -14;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="ths-stage"
      role="img"
      aria-label="A Terms of Service agreement whose clauses are ticked off, signed with a pen and stamped Agreed"
    >
      <style>{CSS}</style>
      <div className="ths-halo" aria-hidden="true" />
      <div className="ths-shadow" aria-hidden="true" />

      <div ref={sceneRef} className="ths-scene" aria-hidden="true">
        {/* the agreement */}
        <div className="ths-doc">
          <div className="ths-doc-head">
            <span className="ths-doc-ico">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M4 1.8h5.4L12.6 5v9.2H4V1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9.2 1.9V5.2h3.3M6 8.2h4.4M6 10.8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="ths-doc-title">Terms of Service</span>
            <span className="ths-badge">
              <span className="ths-badge-a"><i /> Pending</span>
              <span className="ths-badge-b"><i /> Accepted</span>
            </span>
          </div>

          <ul className="ths-clauses">
            {CLAUSES.map((c, i) => (
              <li key={c} className="ths-clause">
                <span className={`ths-box ths-box-${i}`}>
                  <svg viewBox="0 0 16 16" fill="none">
                    <path pathLength={1} d="m3.5 8.4 3 3 6-6.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="ths-clause-body">
                  <b>{c}</b>
                  <span className="ths-line" style={{ width: i === 1 ? "70%" : "86%" }} />
                </span>
              </li>
            ))}
          </ul>

          <div className="ths-sign">
            <span className="ths-sign-k">Signature</span>
            <div className="ths-sign-pad">
              <svg className="ths-sig" viewBox="0 0 170 40" fill="none">
                <path pathLength={1} d={SIGNATURE} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="ths-pen">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M3 21l2.2-6.6L16.6 3a2.1 2.1 0 0 1 3 0l1.4 1.4a2.1 2.1 0 0 1 0 3L9.6 18.8 3 21Z" fill="#0f3c99" />
                  <path d="M14.8 4.8l4.4 4.4" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" />
                  <path d="M3 21l2.2-6.6 4.4 4.4L3 21Z" fill="#079cc4" />
                </svg>
              </span>
            </div>
            <span className="ths-sign-line" />
          </div>
        </div>

        {/* the stamp */}
        <div className="ths-stamp">
          <span className="ths-ring" />
          <div className="ths-stamp-face">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="m3.5 8.4 3 3 6-6.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <b>Agreed</b>
          </div>
        </div>

        {/* last updated */}
        <span className="ths-chip">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2.2" y="3.2" width="11.6" height="10.6" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.2 6.6h11.6M5.4 1.8v2.6M10.6 1.8v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Updated Jan 1, 2026
        </span>
      </div>
    </div>
  );
}

// Each clause is ticked a beat after the one above it.
const clauseFrames = [12, 20, 28]
  .map(
    (at, i) => `
@keyframes ths-box-${i} { 0%, ${at}% { background: transparent; border-color: rgba(8,19,46,.2); transform: scale(1); } ${at + 2}% { transform: scale(1.18); } ${at + 4}%, 93% { background: #14a06a; border-color: #14a06a; transform: scale(1); } 97%, 100% { background: transparent; border-color: rgba(8,19,46,.2); transform: scale(1); } }
@keyframes ths-tick-${i} { 0%, ${at}% { stroke-dashoffset: 1; } ${at + 4}%, 93% { stroke-dashoffset: 0; } 97%, 100% { stroke-dashoffset: 1; } }
.ths-box-${i} { animation: ths-box-${i} ${CYCLE_S} ease-out infinite; }
.ths-box-${i} path { animation: ths-tick-${i} ${CYCLE_S} ease-out infinite; }`
  )
  .join("");

const CSS = `
.ths-stage { position: relative; width: 100%; height: 410px; display: flex; align-items: center; justify-content: center; perspective: 1500px; perspective-origin: 50% 48%; }
.ths-halo { position: absolute; inset: 6% 4% 4%; border-radius: 50%; pointer-events: none; filter: blur(9px);
  background: radial-gradient(closest-side, rgba(7,156,196,.15), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.08), transparent 80%); }
.ths-shadow { position: absolute; left: 50%; bottom: 30px; width: 340px; height: 56px; margin-left: -170px; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, rgba(8,19,46,.18), transparent 74%); }
.ths-scene { --ths-scale: .86; position: relative; flex: none; width: 430px; height: 440px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--ths-scale)) rotateX(var(--rx, 6deg)) rotateY(var(--ry, -14deg)); }

/* agreement */
.ths-doc { position: absolute; left: 50px; top: 60px; width: 300px; height: 314px; border-radius: 18px; padding: 16px 17px;
  background: var(--mkt-surface, #fff); color: var(--mkt-ink, #08132e); border: 1px solid rgba(8,19,46,.08); transform: translateZ(40px);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 38px 62px -30px rgba(8,31,92,.55), 0 8px 18px -9px rgba(8,31,92,.2);
  animation: ths-float 6s ease-in-out infinite; }
.dark .ths-doc { border-color: rgba(255,255,255,.08); box-shadow: 0 38px 62px -30px rgba(0,0,0,.7); }
@keyframes ths-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
.ths-doc-head { display: flex; align-items: center; gap: 8px; padding-bottom: 11px; border-bottom: 1px solid rgba(8,19,46,.07); }
.dark .ths-doc-head { border-color: rgba(255,255,255,.08); }
.ths-doc-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; background: rgba(15,60,153,.1); color: #0f3c99; }
.dark .ths-doc-ico { background: rgba(123,164,255,.16); color: #7ba4ff; }
.ths-doc-title { font-size: 12.5px; font-weight: 700; }
.ths-badge { position: relative; margin-left: auto; height: 22px; width: 84px; }
.ths-badge > span { position: absolute; right: 0; top: 0; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.ths-badge i { width: 5px; height: 5px; border-radius: 50%; }
.ths-badge-a { background: rgba(217,119,6,.12); color: #b45b0c; animation: ths-badge-a ${CYCLE_S} ease-in-out infinite; }
.ths-badge-a i { background: #f08a1c; animation: ths-blink 1s steps(1) infinite; }
.ths-badge-b { background: rgba(20,160,106,.12); color: #0b6b42; animation: ths-badge-b ${CYCLE_S} ease-in-out infinite; }
.ths-badge-b i { background: #14a06a; }
.dark .ths-badge-a { color: #f0a44e; } .dark .ths-badge-b { color: #4fd49b; }
@keyframes ths-badge-a { 0%, 64% { opacity: 1; transform: none; } 68%, 94% { opacity: 0; transform: translateY(-6px); } 98%, 100% { opacity: 1; transform: none; } }
@keyframes ths-badge-b { 0%, 65% { opacity: 0; transform: translateY(6px); } 69%, 93% { opacity: 1; transform: none; } 97%, 100% { opacity: 0; transform: translateY(6px); } }
@keyframes ths-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: .25; } }

.ths-clauses { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
.ths-clause { display: flex; align-items: flex-start; gap: 10px; }
.ths-box { width: 18px; height: 18px; flex: none; border-radius: 5px; border: 1.6px solid rgba(8,19,46,.2); display: grid; place-items: center; color: #fff; }
.dark .ths-box { border-color: rgba(255,255,255,.22); }
.ths-box svg { width: 13px; height: 13px; }
.ths-box path { stroke-dasharray: 1; stroke-dashoffset: 1; }
${clauseFrames}
.ths-clause-body { flex: 1; min-width: 0; }
.ths-clause-body b { display: block; font-size: 11.5px; font-weight: 700; line-height: 18px; }
.ths-line { display: block; height: 6px; border-radius: 99px; background: rgba(8,19,46,.08); margin-top: 6px; }
.dark .ths-line { background: rgba(255,255,255,.09); }

.ths-sign { margin-top: 18px; padding: 10px 12px 12px; border-radius: 12px; background: rgba(8,19,46,.03); border: 1px solid rgba(8,19,46,.05); }
.dark .ths-sign { background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.06); }
.ths-sign-k { font-size: 10.5px; font-weight: 600; color: #5b6779; }
.dark .ths-sign-k { color: #94a3b8; }
.ths-sign-pad { position: relative; height: 44px; margin-top: 2px; }
.ths-sig { position: absolute; left: 2px; top: 2px; width: 170px; height: 40px; color: #0f3c99; }
.dark .ths-sig { color: #7ba4ff; }
.ths-sig path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ths-sig ${CYCLE_S} linear infinite; }
@keyframes ths-sig { 0%, 36% { stroke-dashoffset: 1; } 60%, 93% { stroke-dashoffset: 0; } 97%, 100% { stroke-dashoffset: 1; opacity: 1; } }
.ths-sign-line { display: block; height: 1.5px; margin-top: 2px; background: repeating-linear-gradient(90deg, rgba(8,19,46,.25) 0 6px, transparent 6px 10px); }
.dark .ths-sign-line { background: repeating-linear-gradient(90deg, rgba(255,255,255,.25) 0 6px, transparent 6px 10px); }
/* The pen's nib is its bottom-left corner; it is placed at the signature's origin. */
.ths-pen { position: absolute; left: 2px; top: 2px; width: 26px; height: 26px; margin-top: -26px; opacity: 0;
  filter: drop-shadow(0 6px 6px rgba(8,31,92,.35)); animation: ths-pen ${CYCLE_S} linear infinite; }
.ths-pen svg { width: 100%; height: 100%; }
@keyframes ths-pen {
  0%, 34% { transform: translate(-6px, 10px); opacity: 0; }
  37% { transform: translate(4px, 30px); opacity: 1; }
  40% { transform: translate(22px, 18px); }
  43% { transform: translate(38px, 24px); }
  46% { transform: translate(54px, 24px); }
  50% { transform: translate(74px, 20px); }
  53% { transform: translate(92px, 28px); }
  56% { transform: translate(120px, 22px); opacity: 1; }
  60% { transform: translate(164px, 18px); opacity: 1; }
  64%, 100% { transform: translate(180px, 0); opacity: 0; } }

/* stamp */
.ths-stamp { position: absolute; left: 284px; top: 276px; width: 108px; height: 108px; transform: translateZ(130px); }
.ths-stamp-face { position: absolute; inset: 0; border-radius: 50%; display: grid; place-content: center; justify-items: center; gap: 2px;
  background: var(--mkt-surface, #fff); color: #0f3c99; border: 3px solid currentColor; box-shadow: inset 0 0 0 4px var(--mkt-surface, #fff), inset 0 0 0 5.5px currentColor, 0 22px 30px -16px rgba(8,31,92,.55);
  opacity: 0; animation: ths-stamp ${CYCLE_S} cubic-bezier(.2,.9,.3,1.2) infinite; }
.dark .ths-stamp-face { color: #7ba4ff; }
.ths-stamp-face svg { width: 22px; height: 22px; }
.ths-stamp-face b { font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
@keyframes ths-stamp {
  0%, 62% { opacity: 0; transform: scale(1.9) rotate(-26deg); }
  66% { opacity: 1; transform: scale(.92) rotate(-12deg); }
  69%, 93% { opacity: 1; transform: scale(1) rotate(-12deg); }
  97%, 100% { opacity: 0; transform: scale(1) rotate(-12deg); } }
.ths-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(7,156,196,.6); opacity: 0; animation: ths-ring ${CYCLE_S} ease-out infinite; }
@keyframes ths-ring { 0%, 65% { transform: scale(.8); opacity: 0; } 66% { opacity: .9; } 80%, 100% { transform: scale(1.7); opacity: 0; } }

/* last-updated chip */
.ths-chip { position: absolute; left: 270px; top: 30px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 10px; border-radius: 999px; white-space: nowrap;
  background: var(--mkt-surface, #fff); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 14px 26px -18px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--mkt-ink, #08132e);
  transform: translateZ(150px); animation: ths-bob 5s ease-in-out infinite; }
.dark .ths-chip { border-color: rgba(255,255,255,.1); }
.ths-chip svg { color: #0a7a99; }
.dark .ths-chip svg { color: #5cc8e6; }
@keyframes ths-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }

@media (max-width: 1279px) { .ths-stage { height: 390px; } .ths-scene { --ths-scale: .8; } }
@media (max-width: 620px) { .ths-stage { height: 320px; } .ths-scene { --ths-scale: .68; } .ths-chip { left: 250px; } }
@media (max-width: 400px) { .ths-stage { height: 280px; } .ths-scene { --ths-scale: .6; } }
/* Phones: flatter, straight-on scene. */
@media (max-width: 639px) { .ths-stage { perspective: 2600px; } .ths-scene { transform: scale(var(--ths-scale)) rotateX(3deg) rotateY(-5deg) !important; } }

/* Reduced motion: the finished state, still. */
@media (prefers-reduced-motion: reduce) {
  .ths-stage *, .ths-stage *::before { animation: none !important; }
  .ths-box { background: #14a06a; border-color: #14a06a; } .ths-box path, .ths-sig path { stroke-dashoffset: 0; }
  .ths-badge-a { opacity: 0; } .ths-badge-b { opacity: 1; }
  .ths-stamp-face { opacity: 1; transform: rotate(-12deg); }
}
`;
