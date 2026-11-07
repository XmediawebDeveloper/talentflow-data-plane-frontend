"use client";

import { useEffect, useRef } from "react";

/**
 * Privacy hero — a policy document in 3D. A scan beam runs down it and masks
 * each personal field as it passes, then the shield in front locks and the
 * rights from the policy (access, update, delete) pop out beside it. A cookie
 * toggle floats at the side. The scene tilts towards the pointer. 7 s loop.
 *
 * Copy only restates the policy itself: no encryption, certification or
 * compliance claims.
 */

const CYCLE_S = "7s";

const FIELDS = [
  { k: "Name", v: "Jordan Lee" },
  { k: "Email", v: "jordan@company.com" },
  { k: "Company", v: "Acme Inc." },
];

const RIGHTS = ["Access", "Update", "Delete"];

export function PrivacyHeroStage() {
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
      className="phs-stage"
      role="img"
      aria-label="A privacy policy document whose personal details are masked one by one, sealed by a shield, with your rights to access, update and delete"
    >
      <style>{CSS}</style>
      <div className="phs-halo" aria-hidden="true" />
      <div className="phs-shadow" aria-hidden="true" />

      <div ref={sceneRef} className="phs-scene" aria-hidden="true">
        {/* the policy document */}
        <div className="phs-doc">
          <div className="phs-doc-head">
            <span className="phs-doc-ico">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M4 1.8h5.4L12.6 5v9.2H4V1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9.2 1.9V5.2h3.3M6 8.2h4.4M6 10.8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="phs-doc-title">Privacy Policy</span>
            <span className="phs-badge">
              <span className="phs-badge-a"><i /> Reviewing</span>
              <span className="phs-badge-b"><i /> In your control</span>
            </span>
          </div>

          <div className="phs-fields">
            {FIELDS.map((f, i) => (
              <div key={f.k} className="phs-field">
                <span className="k">{f.k}</span>
                <span className="v">
                  <span className={`phs-raw phs-raw-${i}`}>{f.v}</span>
                  <span className={`phs-mask phs-mask-${i}`}>
                    {Array.from({ length: 7 }, (_, d) => <i key={d} />)}
                  </span>
                </span>
              </div>
            ))}
            <span className="phs-beam" />
          </div>

          <div className="phs-clauses">
            {["Information we collect", "How we use it", "Your rights"].map((t, i) => (
              <div key={t} className="phs-clause">
                <div className="phs-clause-h"><b>{i + 1}.</b> {t}</div>
                <span className="phs-line" style={{ width: "92%" }} />
                <span className="phs-line" style={{ width: i === 1 ? "64%" : "78%" }} />
              </div>
            ))}
          </div>
        </div>

        {/* the shield */}
        <div className="phs-shield">
          <span className="phs-pulse" />
          <svg viewBox="0 0 120 140" fill="none">
            <defs>
              <linearGradient id="phs-sg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0f3c99" />
                <stop offset="1" stopColor="#079cc4" />
              </linearGradient>
              <linearGradient id="phs-sh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".35" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M60 6 106 22v40c0 32-20 56-46 70C34 118 14 94 14 62V22L60 6Z" fill="url(#phs-sg)" />
            <path d="M60 6 106 22v40c0 32-20 56-46 70C34 118 14 94 14 62V22L60 6Z" stroke="#fff" strokeOpacity=".28" strokeWidth="2" />
            <path d="M60 14 98 27v20c-14 5-30 7-38 7S36 52 22 47V27L60 14Z" fill="url(#phs-sh)" />
            {/* lock */}
            <g className="phs-shackle">
              <path d="M47 64V54a13 13 0 0 1 26 0v10" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
            </g>
            <rect x="40" y="62" width="40" height="32" rx="7" fill="#fff" />
            <circle cx="60" cy="75" r="4.2" fill="#0f3c99" />
            <path d="M60 78v7" stroke="#0f3c99" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* your rights */}
        {RIGHTS.map((r, i) => (
          <span key={r} className={`phs-right phs-right-${i}`}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="m3.5 8.4 3 3 6-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {r}
          </span>
        ))}

        {/* cookie preference */}
        <span className="phs-cookie">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M13.9 8.6A6 6 0 1 1 7.4 2.1a2 2 0 0 0 2.4 2.4 2 2 0 0 0 2.4 2.4 2 2 0 0 0 1.7 1.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <circle cx="5.6" cy="7" r=".9" fill="currentColor" />
            <circle cx="8.4" cy="10.6" r=".9" fill="currentColor" />
            <circle cx="5.4" cy="10.4" r=".7" fill="currentColor" />
          </svg>
          Cookies
          <span className="phs-toggle"><i /></span>
        </span>
      </div>
    </div>
  );
}

// Each field is masked a beat after the one above it, as the beam passes.
const maskFrames = [20, 30, 40]
  .map(
    (at, i) => `
@keyframes phs-raw-${i} { 0%, ${at}% { opacity: 1; filter: blur(0); } ${at + 4}%, 92% { opacity: 0; filter: blur(4px); } 97%, 100% { opacity: 1; filter: blur(0); } }
@keyframes phs-mask-${i} { 0%, ${at}% { opacity: 0; transform: scaleX(.4); } ${at + 4}%, 92% { opacity: 1; transform: scaleX(1); } 97%, 100% { opacity: 0; transform: scaleX(.4); } }
.phs-raw-${i} { animation: phs-raw-${i} ${CYCLE_S} ease-in-out infinite; }
.phs-mask-${i} { animation: phs-mask-${i} ${CYCLE_S} cubic-bezier(.34,1.56,.64,1) infinite; }`
  )
  .join("");

// Rights pop out one after another once the shield has locked.
const rightFrames = [64, 69, 74]
  .map(
    (at, i) => `
@keyframes phs-right-${i} { 0%, ${at}% { opacity: 0; transform: translateZ(150px) translateX(-34px) scale(.6); } ${at + 5}%, 92% { opacity: 1; transform: translateZ(150px) translateX(0) scale(1); } 97%, 100% { opacity: 0; transform: translateZ(150px) translateX(-10px) scale(.9); } }
.phs-right-${i} { animation: phs-right-${i} ${CYCLE_S} cubic-bezier(.34,1.56,.64,1) infinite; }`
  )
  .join("");

const CSS = `
.phs-stage { position: relative; width: 100%; height: 470px; display: flex; align-items: center; justify-content: center; perspective: 1500px; perspective-origin: 50% 48%; }
.phs-halo { position: absolute; inset: 6% 4% 4%; border-radius: 50%; pointer-events: none; filter: blur(9px);
  background: radial-gradient(closest-side, rgba(7,156,196,.15), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.08), transparent 80%); }
.phs-shadow { position: absolute; left: 50%; bottom: 34px; width: 360px; height: 60px; margin-left: -180px; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, rgba(8,19,46,.18), transparent 74%); }
.phs-scene { position: relative; flex: none; width: 430px; height: 440px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--phs-scale, 1)) rotateX(var(--rx, 6deg)) rotateY(var(--ry, -14deg)); }

/* document */
.phs-doc { position: absolute; left: 34px; top: 36px; width: 296px; height: 360px; border-radius: 18px; padding: 16px 17px;
  background: var(--mkt-surface, #fff); color: var(--mkt-ink, #08132e); border: 1px solid rgba(8,19,46,.08); transform: translateZ(40px);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 38px 62px -30px rgba(8,31,92,.55), 0 8px 18px -9px rgba(8,31,92,.2);
  animation: phs-float 6s ease-in-out infinite; }
.dark .phs-doc { border-color: rgba(255,255,255,.08); box-shadow: 0 38px 62px -30px rgba(0,0,0,.7); }
@keyframes phs-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
.phs-doc-head { display: flex; align-items: center; gap: 8px; padding-bottom: 11px; border-bottom: 1px solid rgba(8,19,46,.07); }
.dark .phs-doc-head { border-color: rgba(255,255,255,.08); }
.phs-doc-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; background: rgba(15,60,153,.1); color: #0f3c99; }
.dark .phs-doc-ico { background: rgba(123,164,255,.16); color: #7ba4ff; }
.phs-doc-title { font-size: 12.5px; font-weight: 700; }
.phs-badge { position: relative; margin-left: auto; height: 22px; width: 112px; }
.phs-badge > span { position: absolute; right: 0; top: 0; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.phs-badge i { width: 5px; height: 5px; border-radius: 50%; }
.phs-badge-a { background: rgba(217,119,6,.12); color: #b45b0c; animation: phs-badge-a ${CYCLE_S} ease-in-out infinite; }
.phs-badge-a i { background: #f08a1c; animation: phs-blink 1s steps(1) infinite; }
.phs-badge-b { background: rgba(20,160,106,.12); color: #0b6b42; animation: phs-badge-b ${CYCLE_S} ease-in-out infinite; }
.phs-badge-b i { background: #14a06a; }
.dark .phs-badge-a { color: #f0a44e; } .dark .phs-badge-b { color: #4fd49b; }
@keyframes phs-badge-a { 0%, 56% { opacity: 1; transform: none; } 60%, 94% { opacity: 0; transform: translateY(-6px); } 98%, 100% { opacity: 1; transform: none; } }
@keyframes phs-badge-b { 0%, 57% { opacity: 0; transform: translateY(6px); } 61%, 93% { opacity: 1; transform: none; } 97%, 100% { opacity: 0; transform: translateY(6px); } }
@keyframes phs-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: .25; } }

.phs-fields { position: relative; margin-top: 12px; padding: 4px 10px; border-radius: 12px; background: rgba(8,19,46,.03); border: 1px solid rgba(8,19,46,.05); overflow: hidden; }
.dark .phs-fields { background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.06); }
.phs-field { display: flex; align-items: center; gap: 8px; height: 30px; font-size: 11.5px; }
.phs-field + .phs-field { border-top: 1px dashed rgba(8,19,46,.08); }
.dark .phs-field + .phs-field { border-color: rgba(255,255,255,.08); }
.phs-field .k { width: 56px; flex: none; font-weight: 600; color: #5b6779; }
.dark .phs-field .k { color: #94a3b8; }
.phs-field .v { position: relative; flex: 1; height: 16px; }
.phs-raw { position: absolute; left: 0; top: 0; font-weight: 700; white-space: nowrap; line-height: 16px; }
.phs-mask { position: absolute; left: 0; top: 3px; display: flex; gap: 4px; transform-origin: left center; opacity: 0; }
.phs-mask i { width: 9px; height: 9px; border-radius: 50%; background: linear-gradient(145deg, #0f3c99, #079cc4); }
.phs-beam { position: absolute; left: 0; right: 0; top: 0; height: 26px; pointer-events: none; opacity: 0;
  background: linear-gradient(180deg, transparent, rgba(7,156,196,.16) 70%, rgba(7,156,196,.7) 96%, transparent);
  animation: phs-beam ${CYCLE_S} ease-in-out infinite; }
@keyframes phs-beam { 0%, 10% { transform: translateY(-26px); opacity: 0; } 13% { opacity: 1; } 46% { transform: translateY(96px); opacity: 1; } 50%, 100% { transform: translateY(96px); opacity: 0; } }
${maskFrames}

.phs-clauses { margin-top: 14px; display: grid; gap: 13px; }
.phs-clause-h { font-size: 11px; font-weight: 700; margin-bottom: 6px; }
.phs-clause-h b { color: #0f3c99; margin-right: 2px; }
.dark .phs-clause-h b { color: #7ba4ff; }
.phs-line { display: block; height: 6px; border-radius: 99px; background: rgba(8,19,46,.08); margin-top: 5px; }
.dark .phs-line { background: rgba(255,255,255,.09); }

/* shield */
.phs-shield { position: absolute; left: 262px; top: 196px; width: 132px; height: 154px; transform: translateZ(130px);
  filter: drop-shadow(0 26px 30px rgba(8,31,92,.45)); animation: phs-shield ${CYCLE_S} cubic-bezier(.34,1.56,.64,1) infinite; }
.phs-shield svg { position: relative; width: 100%; height: 100%; }
@keyframes phs-shield { 0%, 54% { scale: 1; rotate: 0deg; } 58% { scale: 1.1; rotate: -4deg; } 63%, 100% { scale: 1; rotate: 0deg; } }
.phs-shackle { animation: phs-shackle ${CYCLE_S} cubic-bezier(.5,0,.2,1.4) infinite; }
@keyframes phs-shackle { 0%, 50% { transform: translateY(-9px); } 57%, 93% { transform: translateY(0); } 98%, 100% { transform: translateY(-9px); } }
.phs-pulse { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 2px solid rgba(7,156,196,.55); opacity: 0;
  animation: phs-pulse ${CYCLE_S} ease-out infinite; }
@keyframes phs-pulse { 0%, 56% { transform: scale(.6); opacity: 0; } 58% { opacity: .9; } 72%, 100% { transform: scale(1.7); opacity: 0; } }

/* rights chips */
.phs-right { position: absolute; left: 330px; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px 0 8px; border-radius: 999px; opacity: 0;
  background: var(--mkt-surface, #fff); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 14px 26px -18px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--mkt-ink, #08132e); }
.dark .phs-right { border-color: rgba(255,255,255,.1); }
.phs-right svg { width: 16px; height: 16px; padding: 2px; border-radius: 50%; background: #14a06a; color: #fff; }
.phs-right-0 { top: 96px; } .phs-right-1 { top: 134px; left: 352px; } .phs-right-2 { top: 172px; left: 338px; }
${rightFrames}

/* cookie toggle */
.phs-cookie { position: absolute; left: -14px; top: 368px; display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 8px 0 11px; border-radius: 999px;
  background: var(--mkt-surface, #fff); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 14px 26px -18px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--mkt-ink, #08132e);
  transform: translateZ(160px); animation: phs-bob 5s ease-in-out infinite; }
.dark .phs-cookie { border-color: rgba(255,255,255,.1); }
.phs-cookie > svg { color: #b45b0c; }
.dark .phs-cookie > svg { color: #f0a44e; }
@keyframes phs-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
.phs-toggle { position: relative; width: 28px; height: 16px; border-radius: 99px; background: rgba(8,19,46,.15); animation: phs-track ${CYCLE_S} ease-in-out infinite; }
.phs-toggle i { position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(8,19,46,.3); animation: phs-knob ${CYCLE_S} cubic-bezier(.34,1.56,.64,1) infinite; }
@keyframes phs-track { 0%, 32% { background: rgba(8,19,46,.15); } 36%, 92% { background: #14a06a; } 96%, 100% { background: rgba(8,19,46,.15); } }
@keyframes phs-knob { 0%, 32% { transform: translateX(0); } 37%, 92% { transform: translateX(12px); } 97%, 100% { transform: translateX(0); } }

.phs-stage { height: 410px; } .phs-scene { --phs-scale: .86; }
@media (max-width: 1279px) { .phs-stage { height: 390px; } .phs-scene { --phs-scale: .8; } }
@media (max-width: 620px) { .phs-stage { height: 320px; } .phs-scene { --phs-scale: .68; } .phs-cookie { left: 10px; } }
@media (max-width: 400px) { .phs-stage { height: 280px; } .phs-scene { --phs-scale: .6; } }
/* Phones: flatter, straight-on scene. */
@media (max-width: 639px) { .phs-stage { perspective: 2600px; } .phs-scene { transform: scale(var(--phs-scale, 1)) rotateX(3deg) rotateY(-5deg) !important; } }

/* Reduced motion: the finished state, still. */
@media (prefers-reduced-motion: reduce) {
  .phs-stage *, .phs-stage *::before { animation: none !important; }
  .phs-raw { opacity: 0; } .phs-mask { opacity: 1; transform: none; }
  .phs-badge-a { opacity: 0; } .phs-badge-b { opacity: 1; }
  .phs-right { opacity: 1; transform: translateZ(150px); }
  .phs-toggle { background: #14a06a; } .phs-toggle i { transform: translateX(12px); }
}
`;
