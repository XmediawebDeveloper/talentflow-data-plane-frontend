"use client";

import { useEffect, useRef } from "react";

/**
 * How-it-works hero — automated shortlisting in 3D. The loop OPENS on the
 * question "Best of 6 candidates?", which breaks apart into a pile of six
 * resumes; the top one is scanned, the weak ones fall away, the two best lift
 * forward as the shortlist, and everything folds back into the question.
 * The scene tilts towards the pointer and a chip counts the resumes in.
 *
 * Timeline (10 s): 0–16% "?" holds · 16–24% it breaks up · 18–30% resumes
 * land · 36–50% scan · 52–60% weak ones drop, best two lift · 60–84% hold ·
 * 86–100% everything folds back into the "?".
 *
 * Sample data only (generic names, illustrative scores).
 */

const CYCLE_MS = 10000;
const CYCLE = `${CYCLE_MS / 1000}s`;

type Resume = {
  cls: string;
  initials: string;
  name: string;
  role: string;
  score: number;
  tags?: string[];
  shortlisted?: boolean;
  scan?: boolean;
  vars: Record<string, string>;
};

// Back to front. The two highest scores are the shortlist.
const RESUMES: Resume[] = [
  { cls: "r6", initials: "KP", name: "Karan P.", role: "QA Engineer", score: 31, vars: { "--x0": "-6px", "--z0": "-90px", "--rot": "-7deg" } },
  { cls: "r5", initials: "MR", name: "Meera R.", role: "Frontend Dev", score: 44, vars: { "--x0": "8px", "--z0": "-60px", "--rot": "5deg" } },
  {
    cls: "r4", initials: "AR", name: "Ananya R.", role: "Senior React Eng", score: 92, tags: ["React", "TS", "6 yrs"], shortlisted: true,
    vars: { "--x0": "-4px", "--z0": "-30px", "--rot": "-3deg", "--x1": "-46px", "--y1": "6px", "--sx": "-92px", "--sy": "28px" },
  },
  { cls: "r3", initials: "VS", name: "Vikram S.", role: "Full-stack Dev", score: 58, vars: { "--x0": "6px", "--z0": "0px", "--rot": "2deg", "--x1": "24px", "--y1": "2px" } },
  { cls: "r2", initials: "AK", name: "Arjun K.", role: "Backend Dev", score: 39, vars: { "--x0": "-2px", "--z0": "40px", "--rot": "-1deg", "--x1": "-10px" } },
  {
    cls: "r1", initials: "SD", name: "Sneha D.", role: "Product Designer", score: 90, tags: ["Figma", "UX", "7 yrs"], shortlisted: true, scan: true,
    vars: { "--x0": "0px", "--z0": "70px", "--rot": "0deg", "--x1": "0px", "--y1": "0px", "--sx": "74px", "--sy": "40px" },
  },
];

export function HowHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 6, ty = -18, cx = 6, cy = -18;
    let tilt: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      scene.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      scene.style.setProperty("--ry", `${cy.toFixed(2)}deg`);
      tilt = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = 6 - ((e.clientY - r.top) / r.height - 0.5) * 14;
      ty = -18 + ((e.clientX - r.left) / r.width - 0.5) * 20;
      if (!tilt) tilt = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 6;
      ty = -18;
      if (!tilt) tilt = requestAnimationFrame(tick);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    // "N resumes in" counts up over the first ~30% of each loop.
    const t0 = performance.now();
    let shown = -1;
    let countFrame = 0;
    const count = (now: number) => {
      const loop = ((now - t0) % CYCLE_MS) / CYCLE_MS;
      const p = Math.max(0, Math.min((loop - 0.22) / 0.24, 1));
      const n = Math.round(p * 6);
      if (n !== shown && countRef.current) {
        shown = n;
        countRef.current.textContent = `${n} ${n === 1 ? "resume" : "resumes"} in`;
      }
      countFrame = requestAnimationFrame(count);
    };
    countFrame = requestAnimationFrame(count);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (tilt) cancelAnimationFrame(tilt);
      cancelAnimationFrame(countFrame);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="hhs-stage"
      role="img"
      aria-label="Six resumes are scored by AI, the two best are shortlisted, leaving the question of who is the best of six candidates"
    >
      <style>{CSS}</style>
      <div className="hhs-halo" aria-hidden="true" />
      <div className="hhs-shadow" aria-hidden="true" />

      <div ref={sceneRef} className="hhs-scene" aria-hidden="true">
        <span className="hhs-chip hhs-chip--scan"><i /> AI screening</span>
        <span className="hhs-chip hhs-chip--short"><i /> 2 shortlisted</span>
        <span className="hhs-chip hhs-chip--count"><i /> <span ref={countRef}>6 resumes in</span></span>

        {RESUMES.map((r) => (
          <div
            key={r.cls}
            className={`hhs-resume ${r.cls}${r.shortlisted ? " is-short" : ""}`}
            style={r.vars as React.CSSProperties}
          >
            <div className="hhs-head">
              <span className="hhs-avatar">{r.initials}</span>
              <div>
                <div className="hhs-name">{r.name}</div>
                <div className="hhs-role">{r.role}</div>
              </div>
              <span className={`hhs-score ${r.score >= 80 ? "good" : r.score < 50 ? "low" : ""}`}>{r.score}</span>
            </div>
            <div className="hhs-lines"><i /><i /><i /><i /></div>
            {r.tags && (
              <div className="hhs-tags">
                {r.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            )}
            {r.scan && <div className="hhs-scan" />}
          </div>
        ))}

        <div className="hhs-q">
          <span className="hhs-qring" />
          <div className="hhs-qbubble">?</div>
          <span className="hhs-qcaption">Best of 6 candidates?</span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.hhs-stage { position: relative; width: 100%; height: 500px; display: flex; align-items: center; justify-content: center; perspective: 1500px; perspective-origin: 50% 46%; }
.hhs-halo { position: absolute; inset: 4% 2% 2%; border-radius: 50%; pointer-events: none; filter: blur(9px);
  background: radial-gradient(closest-side, rgba(7,156,196,.15), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.08), transparent 82%); }
.hhs-shadow { position: absolute; left: 50%; bottom: 26px; width: 380px; height: 66px; margin-left: -190px; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, rgba(8,19,46,.18), transparent 74%); }
.hhs-scene { position: relative; flex: none; width: 460px; height: 440px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--hhs-scale, 1)) rotateX(var(--rx, 6deg)) rotateY(var(--ry, -18deg)); }

/* resumes */
.hhs-resume { position: absolute; left: 50%; top: 92px; width: 210px; height: 258px; margin-left: -105px; border-radius: 14px; padding: 14px 14px 12px;
  background: var(--mkt-surface, #fff); color: var(--mkt-ink, #08132e); border: 1px solid rgba(8,19,46,.08); transform-style: preserve-3d; will-change: transform, opacity; opacity: 0;
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 26px 46px -26px rgba(8,31,92,.5), 0 5px 12px -6px rgba(8,31,92,.18);
  animation: hhs-piled ${CYCLE} cubic-bezier(.4,0,.2,1) infinite; }
.hhs-resume.r5 { animation-delay: .07s; } .hhs-resume.r4 { animation-delay: .14s; } .hhs-resume.r3 { animation-delay: .21s; }
.hhs-resume.r2 { animation-delay: .28s; } .hhs-resume.r1 { animation-delay: .35s; }
/* hidden inside the "?", burst out into the pile, then the weak ones fall away */
@keyframes hhs-piled {
  0%, 18% { transform: translateZ(90px) translate3d(0,0,0) rotate(0) scale(.4); opacity: 0; }
  30%, 52% { transform: translateZ(var(--z0, 0px)) translate3d(var(--x1, var(--x0, 0px)), var(--y1, 0px), 0) rotate(var(--rot, 0deg)) scale(1); opacity: 1; }
  60%, 100% { transform: translateZ(var(--z0, 0px)) translate3d(calc(var(--x1, var(--x0, 0px)) * 1.5), calc(var(--y1, 0px) + 54px), 0) rotate(calc(var(--rot, 0deg) + 7deg)) scale(.9); opacity: 0; } }
.hhs-resume.is-short { animation-name: hhs-short; }
/* the best two lift forward, then fold back into the "?" */
@keyframes hhs-short {
  0%, 18% { transform: translateZ(90px) translate3d(0,0,0) rotate(0) scale(.4); opacity: 0; border-color: rgba(8,19,46,.08); }
  30%, 52% { transform: translateZ(var(--z0, 0px)) translate3d(var(--x1, var(--x0, 0px)), var(--y1, 0px), 0) rotate(var(--rot, 0deg)) scale(1); opacity: 1; border-color: rgba(8,19,46,.08); }
  60%, 84% { transform: translateZ(calc(var(--z0, 0px) + 60px)) translate3d(var(--sx, 0px), var(--sy, 0px), 0) rotate(0) scale(1.04); opacity: 1; border-color: rgba(20,160,106,.45);
    box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 0 0 3px rgba(20,160,106,.12), 0 30px 52px -26px rgba(11,107,66,.45); }
  94%, 100% { transform: translateZ(90px) translate3d(0,0,0) rotate(0) scale(.45); opacity: 0; } }

.hhs-head { display: flex; align-items: center; gap: 8px; }
.hhs-avatar { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; font-size: 10px; font-weight: 800; color: #fff;
  background: linear-gradient(145deg, #0f3c99, #079cc4); }
.hhs-name { font-size: 11.5px; font-weight: 700; letter-spacing: -.01em; }
.hhs-role { margin-top: 1px; font-size: 10px; font-weight: 500; color: #7a869c; }
.hhs-score { margin-left: auto; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.hhs-score.good { color: #0b6b42; } .hhs-score.low { color: #b23b33; }
.hhs-lines { margin-top: 10px; display: grid; gap: 5px; }
.hhs-lines i { display: block; height: 4px; border-radius: 3px; background: rgba(8,19,46,.1); }
.hhs-lines i:nth-child(1) { width: 78%; } .hhs-lines i:nth-child(2) { width: 92%; } .hhs-lines i:nth-child(3) { width: 64%; } .hhs-lines i:nth-child(4) { width: 84%; }
.dark .hhs-lines i { background: rgba(255,255,255,.12); }
.hhs-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.hhs-tags span { padding: 2px 6px; border-radius: 5px; background: rgba(15,60,153,.08); color: #14397f; font-size: 9px; font-weight: 700; }
.hhs-scan { position: absolute; left: 8px; right: 8px; top: 8px; height: 2px; border-radius: 2px; opacity: 0;
  background: linear-gradient(90deg, rgba(7,156,196,0), #079cc4, rgba(7,156,196,0)); box-shadow: 0 0 12px rgba(7,156,196,.7);
  animation: hhs-scan ${CYCLE} cubic-bezier(.4,0,.2,1) infinite; }
@keyframes hhs-scan { 0%, 34% { transform: translateY(0); opacity: 0; } 36% { opacity: 1; } 50% { transform: translateY(238px); opacity: 1; } 52%, 100% { transform: translateY(238px); opacity: 0; } }

/* the question: fully visible from the very first frame, then again at the end */
.hhs-q { position: absolute; left: 50%; top: 90px; width: 230px; height: 258px; margin-left: -115px; display: grid; place-items: center; pointer-events: none;
  animation: hhs-q ${CYCLE} cubic-bezier(.22,1,.36,1) infinite; }
@keyframes hhs-q {
  0%, 16% { opacity: 1; transform: translateZ(120px) scale(1) rotate(0); filter: blur(0); }
  24% { opacity: 0; transform: translateZ(150px) scale(1.25) rotate(6deg); filter: blur(6px); }
  86% { opacity: 0; transform: translateZ(60px) scale(.45) rotate(-8deg); filter: blur(6px); }
  95%, 100% { opacity: 1; transform: translateZ(120px) scale(1) rotate(0); filter: blur(0); } }
.hhs-qbubble { width: 176px; height: 176px; border-radius: 50%; display: grid; place-items: center; padding-bottom: 10px; color: #fff; font-size: 92px; font-weight: 800; line-height: 1; letter-spacing: -.05em;
  background: linear-gradient(165deg, #0b1734 0%, #08132e 52%, #0d2148 100%); border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 1px 0 rgba(255,255,255,.16) inset, 0 40px 66px -30px rgba(8,31,92,.72); }
.hhs-qcaption { position: absolute; left: 50%; bottom: -6px; transform: translateX(-50%); white-space: nowrap; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: var(--mkt-surface, #fff); color: var(--mkt-ink, #08132e); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 12px 22px -16px rgba(8,31,92,.5); }
.hhs-qring { position: absolute; left: 50%; top: 50%; width: 176px; height: 176px; margin: -88px 0 0 -88px; border-radius: 50%; border: 2px solid rgba(15,60,153,.28);
  animation: hhs-qring ${CYCLE} ease-out infinite; }
@keyframes hhs-qring { 0% { transform: scale(1); opacity: .9; } 14%, 100% { transform: scale(1.5); opacity: 0; } }

/* step chips */
.hhs-chip { position: absolute; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: 999px; pointer-events: none; opacity: 0;
  background: var(--mkt-surface, #fff); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 14px 26px -18px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--mkt-ink, #08132e); }
.hhs-chip i { width: 6px; height: 6px; border-radius: 50%; display: block; }
.hhs-chip--scan { left: -6px; top: 74px; transform: translateZ(170px); animation: hhs-chip-a ${CYCLE} ease-in-out infinite; }
.hhs-chip--short { right: -14px; top: 300px; transform: translateZ(180px); animation: hhs-chip-b ${CYCLE} ease-in-out infinite; }
.hhs-chip--count { left: -18px; top: 330px; transform: translateZ(150px); animation: hhs-chip-c ${CYCLE} ease-in-out infinite; }
.hhs-chip--scan i { background: #079cc4; } .hhs-chip--short i { background: #14a06a; } .hhs-chip--count i { background: #ed881c; }
@keyframes hhs-chip-c { 0%, 20% { opacity: 0; translate: 0 8px; } 25%, 48% { opacity: 1; translate: 0 0; } 54%, 100% { opacity: 0; translate: 0 -6px; } }
@keyframes hhs-chip-a { 0%, 32% { opacity: 0; translate: 0 8px; } 36%, 52% { opacity: 1; translate: 0 0; } 57%, 100% { opacity: 0; translate: 0 -6px; } }
@keyframes hhs-chip-b { 0%, 56% { opacity: 0; translate: 0 8px; } 61%, 84% { opacity: 1; translate: 0 0; } 89%, 100% { opacity: 0; translate: 0 -6px; } }

@media (max-width: 1279px) { .hhs-stage { height: 470px; } .hhs-scene { --hhs-scale: .92; } }
@media (max-width: 620px) { .hhs-stage { height: 400px; } .hhs-scene { --hhs-scale: .78; } .hhs-chip--scan { left: 18px; } .hhs-chip--short { right: 12px; } .hhs-chip--count { left: 14px; } }
@media (max-width: 400px) { .hhs-stage { height: 370px; } .hhs-scene { --hhs-scale: .7; } }
/* Phones: face the scene almost straight on (the desktop side-tilt shifts it left and pushes chips off-screen), flatten depth, keep chips inside. */
@media (max-width: 639px) { .hhs-stage { perspective: 2600px; } .hhs-scene { transform: scale(calc(var(--hhs-scale, 1) * .94)) rotateX(4deg) rotateY(-5deg) !important; } .hhs-chip--scan, .hhs-chip--count { left: 4px; } .hhs-chip--short { right: 4px; } }

@media (prefers-reduced-motion: reduce) {
  .hhs-stage *, .hhs-stage *::before { animation: none !important; }
  .hhs-resume { opacity: 1; }
  .hhs-resume.r1 { transform: translateZ(70px) translate3d(-40px, -10px, 0) rotate(-5deg); }
  .hhs-resume.r2 { transform: translateZ(50px) translate3d(-18px, 0, 0) rotate(-2deg); }
  .hhs-resume.r3 { transform: translateZ(30px) translate3d(16px, 10px, 0) rotate(3deg); }
  .hhs-resume.r4 { transform: translateZ(10px) translate3d(38px, 20px, 0) rotate(6deg); }
  .hhs-resume.r5, .hhs-resume.r6 { opacity: 0; }
  .hhs-q { opacity: 1; transform: translateZ(120px); }
}
`;
