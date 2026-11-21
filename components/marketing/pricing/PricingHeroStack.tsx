"use client";

import { useEffect, useRef } from "react";
import { DISPLAY } from "../fonts";
import { planPrice, planQuotaRows, type MarketingPlan } from "../plans";

/**
 * Pricing hero — a 3D "cost flow". Three layers stand in depth:
 *   1. the plan you pick (back) → 2. the usage units it includes (middle)
 *   → 3. what you pay (front).
 * On a loop each layer lifts into place and a bead travels forward from one
 * to the next. The whole stack tilts towards the pointer.
 *
 * Numbers come from the live plan (the recommended one, else the first paid
 * plan), so nothing here is hard-coded; the usage bars are illustrative.
 */

/** One full cycle, ms. Must match CYCLE_S in the CSS below. */
const CYCLE = 6500;
const CYCLE_S = `${CYCLE / 1000}s`;

const SEGMENTS = [
  { bead: 0, from: "plan", to: "units", start: 0.13, end: 0.36 },
  { bead: 1, from: "units", to: "invoice", start: 0.36, end: 0.58 },
] as const;

type LayerKey = "plan" | "units" | "invoice";

/** Example share of each unit type used, purely for the moving bars. */
const EXAMPLE_USE = [0.34, 0.58, 0.82];

function pickPlan(plans: MarketingPlan[]): MarketingPlan | null {
  const paid = plans.filter((p) => !p.isTrial && (p.monthlyPrice !== null || p.yearlyPrice !== null));
  return paid.find((p) => p.featured) ?? paid[0] ?? null;
}

export function PricingHeroStack({ plans, isYearly }: { plans: MarketingPlan[]; isYearly: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Partial<Record<LayerKey, HTMLDivElement | null>>>({});
  const beadRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const plan = pickPlan(plans);
  const price = plan ? planPrice(plan, isYearly) : null;
  const quotas = plan ? planQuotaRows(plan, isYearly) : [];
  const quota = (label: string) => quotas.find((q) => q.label === label)?.value;
  const unitRows = [
    { label: "Resume scoring", value: quota("Resume scores") },
    { label: "Assessments", value: quota("Assessments") },
    { label: "AI interviews", value: quota("AI interviews") },
  ];
  const planRows = quotas.filter((q) => q.label === "Max users" || q.label === "Max jobs").slice(0, 2);
  const priceText = price ? price.amount : "—";
  const periodText = price?.period ? price.period.replace("/", "/ ") : "";

  /* Pointer tilt + travelling beads. */
  useEffect(() => {
    const stage = stageRef.current;
    const stack = stackRef.current;
    if (!stage || !stack) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 4, ty = -12, cx = 4, cy = -12;
    let tiltFrame: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      stack.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      stack.style.setProperty("--ry", `${cy.toFixed(2)}deg`);
      tiltFrame = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tx = 4 - py * 14;
      ty = -12 + px * 20;
      if (!tiltFrame) tiltFrame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 4;
      ty = -12;
      if (!tiltFrame) tiltFrame = requestAnimationFrame(tick);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    const centre = (el: HTMLElement) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
    const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
    const t0 = performance.now();
    let loopFrame = 0;
    const loop = (now: number) => {
      const p = ((now - t0) % CYCLE) / CYCLE;
      for (const s of SEGMENTS) {
        const bead = beadRefs.current[s.bead];
        const from = layerRefs.current[s.from];
        const to = layerRefs.current[s.to];
        if (!bead || !from || !to) continue;
        const a = centre(from);
        const b = centre(to);
        const t = ease(Math.max(0, Math.min(1, (p - s.start) / (s.end - s.start))));
        bead.style.left = `${a.x + (b.x - a.x) * t}px`;
        bead.style.top = `${a.y + (b.y - a.y) * t}px`;
      }
      loopFrame = requestAnimationFrame(loop);
    };
    loopFrame = requestAnimationFrame(loop);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (tiltFrame) cancelAnimationFrame(tiltFrame);
      cancelAnimationFrame(loopFrame);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="phs-stage"
      role="img"
      aria-label="How pricing works: the plan you pick, the usage units it includes, then what you pay"
    >
      <style>{CSS}</style>
      <div className="phs-halo" aria-hidden="true" />
      <div className="phs-shadow" aria-hidden="true" />

      <div ref={stackRef} className="phs-stack" aria-hidden="true">
        <span ref={(el) => { beadRefs.current[0] = el; }} className="phs-bead phs-b1" />
        <span ref={(el) => { beadRefs.current[1] = el; }} className="phs-bead phs-b2" />

        {/* 1 · the plan */}
        <div ref={(el) => { layerRefs.current.plan = el; }} className="phs-layer phs-plan">
          <div className="phs-top">
            <span className="phs-ico">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 10V5.2L6 2l4 3.2V10H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M4.8 10V7.2h2.4V10" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
            </span>
            <span className="phs-title">Plan you pick</span>
            <span className="phs-step">01</span>
          </div>
          <div className={`${DISPLAY} phs-main`}>
            <span className="phs-truncate">{plan?.name ?? "Your plan"}</span>
          </div>
          <div className="phs-sub">{priceText} <small>{periodText}</small></div>
          <div className="phs-rows">
            {planRows.map((r) => (
              <div key={r.label} className="phs-row"><span>{r.label}</span><span>{r.value}</span></div>
            ))}
            <div className="phs-row phs-soft">
              <span>{isYearly ? "Yearly billing" : "Monthly billing"}</span>
              <span>{price?.savePercent ? `Save ${price.savePercent}%` : isYearly ? "Billed yearly" : "Billed monthly"}</span>
            </div>
          </div>
        </div>

        {/* 2 · the units it includes */}
        <div ref={(el) => { layerRefs.current.units = el; }} className="phs-layer phs-units">
          <div className="phs-top">
            <span className="phs-ico phs-ico--cyan">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><rect x="1.8" y="1.8" width="8.4" height="8.4" rx="2" stroke="currentColor" strokeWidth="1.2" /><path d="M3.6 6h4.8M6 3.6v4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
            </span>
            <span className="phs-title">Usage units</span>
            <span className="phs-step">02</span>
          </div>
          <div className={`${DISPLAY} phs-main`}>1 unit <small>per action</small></div>
          <div className="phs-inline">
            {unitRows.map((u, i) => (
              <div key={u.label} className="phs-unit">
                <span>{u.label}</span>
                <b>{u.value ? `${u.value} incl.` : "Included"}</b>
                <span className="phs-bar">
                  <i style={{ ["--w" as string]: `${EXAMPLE_USE[i] * 100}%`, animationDelay: `${i * 0.08}s` }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3 · what you pay */}
        <div ref={(el) => { layerRefs.current.invoice = el; }} className="phs-layer phs-invoice">
          <div className="phs-top">
            <span className="phs-inv-label">What you pay</span>
            <span className="phs-step phs-step--dark">03</span>
          </div>
          <div className={`${DISPLAY} phs-inv-total`}>
            {priceText}
            <small>{price?.period ?? ""}</small>
          </div>
          <div className="phs-inv-lines">
            <div className="phs-inv-line"><span>{plan ? `${plan.name} plan` : "Plan"}</span><b>{priceText}</b></div>
            <div className="phs-inv-line"><span>Usage units</span><b>Included</b></div>
            <div className="phs-inv-line"><span>Add-on packs</span><b>Optional</b></div>
            <div className="phs-inv-line phs-inv-line--total"><span>Total</span><b>{priceText}</b></div>
          </div>
          <div className="phs-inv-foot">
            <span className="phs-tick">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.4 4.2 3 5.8l6.6-3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            Top up anytime · no plan change needed
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.phs-stage { position: relative; width: 100%; height: 520px; display: flex; align-items: center; justify-content: center; perspective: 1400px; perspective-origin: 50% 48%; }
.phs-halo { position: absolute; inset: 2% 0 0; border-radius: 50%; pointer-events: none; filter: blur(8px);
  background: radial-gradient(closest-side, var(--raw-rgba-7-156-196-0p15), transparent 70%), radial-gradient(closest-side, var(--raw-rgba-15-60-153-0p08), transparent 80%); }
.phs-shadow { position: absolute; left: 50%; bottom: 14px; width: 400px; height: 70px; margin-left: -200px; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, var(--raw-rgba-8-19-46-0p17), transparent 74%); }

.phs-stack { position: relative; flex: none; width: 480px; height: 470px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--phs-scale, 1)) rotateX(var(--rx, 4deg)) rotateY(var(--ry, -12deg)); }

.phs-layer { position: absolute; border-radius: 16px; background: var(--mkt-surface, var(--raw-ffffff)); color: var(--mkt-ink, var(--raw-08132e));
  border: 1px solid var(--raw-rgba-8-19-46-0p08); transform-style: preserve-3d; will-change: transform, opacity;
  box-shadow: 0 1px 0 var(--raw-rgba-255-255-255-0p9) inset, 0 30px 54px -30px var(--raw-rgba-8-31-92-0p45), 0 5px 14px -7px var(--raw-rgba-8-31-92-0p16); }
.phs-plan { width: 238px; right: 2px; top: 0; padding: 15px 16px 16px; --z: 0px; animation: phs-lift-plan ${CYCLE_S} cubic-bezier(.4,0,.2,1) infinite; }
.phs-units { width: 236px; left: 0; top: 122px; padding: 13px 14px 14px; --z: 76px; animation: phs-lift-units ${CYCLE_S} cubic-bezier(.4,0,.2,1) infinite; }
.phs-invoice { width: 238px; right: 0; bottom: 0; padding: 15px 16px 14px; --z: 152px; color: var(--raw-f7f8fb);
  background: linear-gradient(165deg, var(--raw-0b1734) 0%, var(--raw-08132e) 54%, var(--raw-0d2148) 100%); border: 1px solid var(--raw-rgba-255-255-255-0p1);
  box-shadow: 0 1px 0 var(--raw-rgba-255-255-255-0p14) inset, 0 44px 72px -34px var(--raw-rgba-8-31-92-0p7), 0 8px 20px -10px var(--raw-rgba-8-31-92-0p4);
  animation: phs-lift-invoice ${CYCLE_S} cubic-bezier(.4,0,.2,1) infinite; }

@keyframes phs-lift-plan {
  0%, 8% { transform: translateZ(var(--z)) translateY(6px) scale(.98); opacity: .55; }
  16%, 84% { transform: translateZ(var(--z)) translateY(0) scale(1); opacity: 1; }
  92%, 100% { transform: translateZ(var(--z)) translateY(6px) scale(.98); opacity: .55; } }
@keyframes phs-lift-units {
  0%, 22% { transform: translateZ(var(--z)) translateY(8px) scale(.98); opacity: .6; }
  32%, 84% { transform: translateZ(var(--z)) translateY(0) scale(1); opacity: 1; }
  92%, 100% { transform: translateZ(var(--z)) translateY(8px) scale(.98); opacity: .6; } }
@keyframes phs-lift-invoice {
  0%, 40% { transform: translateZ(var(--z)) translateY(10px) scale(.97); opacity: .65; }
  52%, 88% { transform: translateZ(var(--z)) translateY(0) scale(1); opacity: 1; }
  96%, 100% { transform: translateZ(var(--z)) translateY(10px) scale(.97); opacity: .65; } }

.phs-top { display: flex; align-items: center; gap: 8px; }
.phs-ico { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; flex: none; background: var(--raw-rgba-15-60-153-0p1); color: var(--raw-0f3c99); }
.phs-ico--cyan { background: var(--raw-rgba-7-156-196-0p14); color: var(--raw-066d88); }
.phs-title { font-size: 12px; font-weight: 700; letter-spacing: -.01em; }
.phs-step { margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: var(--raw-5b6779); background: var(--raw-f7f8fb);
  border: 1px solid var(--raw-rgba-8-19-46-0p08); border-radius: 999px; padding: 3px 8px; line-height: 1.2; }
.phs-step--dark { background: var(--raw-rgba-255-255-255-0p1); border-color: var(--raw-rgba-255-255-255-0p16); color: var(--raw-rgba-247-248-251-0p8); }
.phs-main { margin-top: 10px; display: flex; align-items: baseline; gap: 6px; font-size: 22px; font-weight: 800; letter-spacing: -.035em; line-height: 1.05; }
.phs-main small { font-size: 11.5px; font-weight: 600; letter-spacing: 0; color: var(--raw-5b6779); }
.phs-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.phs-sub { margin-top: 4px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.phs-sub small { font-size: 11.5px; font-weight: 600; color: var(--raw-5b6779); }
.phs-rows { margin-top: 11px; display: grid; gap: 7px; }
.phs-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; font-weight: 600; color: var(--raw-26334a); }
.phs-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--mkt-ink, var(--raw-08132e)); }
.phs-soft { color: var(--raw-5b6779); font-weight: 500; }
.dark .phs-row, .dark .phs-unit { color: var(--raw-cbd5e1); }

.phs-inline { display: grid; gap: 9px; margin-top: 11px; }
.phs-unit { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; font-size: 11.5px; font-weight: 600; color: var(--raw-26334a); }
.phs-unit b { font-variant-numeric: tabular-nums; }
.phs-bar { grid-column: 1 / -1; height: 4px; border-radius: 999px; background: var(--raw-rgba-8-19-46-0p08); overflow: hidden; margin-top: -3px; }
.phs-bar > i { display: block; height: 100%; width: var(--w); border-radius: 999px; background: linear-gradient(90deg, var(--raw-0f3c99), var(--raw-079cc4));
  transform-origin: left center; transform: scaleX(0); animation: phs-bar ${CYCLE_S} cubic-bezier(.4,0,.2,1) infinite; }
@keyframes phs-bar { 0%, 26% { transform: scaleX(0); } 40%, 88% { transform: scaleX(1); } 96%, 100% { transform: scaleX(0); } }

.phs-inv-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--raw-rgba-247-248-251-0p72); }
.phs-inv-total { margin-top: 5px; font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -.045em; font-variant-numeric: tabular-nums; color: var(--raw-ffffff); }
.phs-inv-total small { margin-left: 4px; font-size: 13px; font-weight: 600; letter-spacing: -.01em; color: var(--raw-rgba-247-248-251-0p58); }
.phs-inv-lines { margin-top: 10px; display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--raw-rgba-255-255-255-0p14); }
.phs-inv-line { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; font-weight: 600; color: var(--raw-rgba-247-248-251-0p86); }
.phs-inv-line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phs-inv-line b { font-variant-numeric: tabular-nums; color: var(--raw-ffffff); white-space: nowrap; }
.phs-inv-line--total { color: var(--raw-ffffff); font-weight: 700; }
.phs-inv-line--total b { color: var(--raw-ffb765); }
.phs-inv-foot { display: flex; align-items: center; gap: 6px; margin-top: 11px; font-size: 11px; font-weight: 600; color: var(--raw-rgba-247-248-251-0p8); }
.phs-tick { width: 14px; height: 14px; border-radius: 50%; background: var(--raw-14a06a); display: grid; place-items: center; flex: none; color: var(--raw-ffffff); }

.phs-bead { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--raw-ffffff); border: 2px solid var(--raw-079cc4);
  box-shadow: 0 0 0 4px var(--raw-rgba-7-156-196-0p16), 0 0 14px var(--raw-rgba-7-156-196-0p6); pointer-events: none; opacity: 0; }
.phs-b1 { animation: phs-bead-1 ${CYCLE_S} ease-in-out infinite; }
.phs-b2 { animation: phs-bead-2 ${CYCLE_S} ease-in-out infinite; }
@keyframes phs-bead-1 { 0%, 12% { opacity: 0; } 14%, 30% { opacity: 1; } 36%, 100% { opacity: 0; } }
@keyframes phs-bead-2 { 0%, 34% { opacity: 0; } 36%, 52% { opacity: 1; } 58%, 100% { opacity: 0; } }

@media (max-width: 1279px) { .phs-stage { height: 470px; } .phs-stack { --phs-scale: .9; } }
@media (max-width: 1023px) { .phs-stage { height: 440px; } .phs-stack { --phs-scale: .86; } }
@media (max-width: 620px) { .phs-stage { height: 360px; } .phs-stack { --phs-scale: .66; } }
@media (max-width: 400px) { .phs-stage { height: 330px; } .phs-stack { --phs-scale: .6; } }
/* Phones: straight-on stack so the side cards are not clipped by the narrow column. */
@media (max-width: 639px) { .phs-stage { perspective: 2400px; } .phs-stack { transform: scale(calc(var(--phs-scale, 1) * .92)) rotateX(3deg) rotateY(-4deg) !important; } }

@media (prefers-reduced-motion: reduce) {
  .phs-layer, .phs-bar > i, .phs-bead { animation: none !important; }
  .phs-plan { transform: translateZ(0); opacity: 1; }
  .phs-units { transform: translateZ(76px); opacity: 1; }
  .phs-invoice { transform: translateZ(152px); opacity: 1; }
  .phs-bar > i { transform: scaleX(1); }
}
`;
