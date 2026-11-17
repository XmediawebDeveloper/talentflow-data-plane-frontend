"use client";

import { useEffect, useRef } from "react";

/**
 * Contact hero — a 3D phone that rings, turns away, and becomes an email
 * that is written and sent (a paper plane leaves the Send button). The
 * whole scene tilts towards the pointer. An 8 s loop (the mockup ran 14 s).
 *
 * Copy is deliberately generic: no phone number, names or reply-time
 * promises we can't back up.
 */

const CYCLE_S = "8s";

export function ContactHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const flip = flipRef.current;
    const email = emailRef.current;
    const plane = planeRef.current;

    // The plane takes off from the Send button.
    const placePlane = () => {
      const send = email?.querySelector<HTMLElement>(".chs-send");
      if (!send || !plane) return;
      plane.style.left = `${send.offsetLeft + send.offsetWidth - 6}px`;
      plane.style.top = `${send.offsetTop + send.offsetHeight / 2 - 13}px`;
    };
    placePlane();
    window.addEventListener("resize", placePlane);

    if (!stage || !flip || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => window.removeEventListener("resize", placePlane);
    }

    let tx = 4, ty = -16, cx = 4, cy = -16;
    let frame: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      flip.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      flip.style.setProperty("--ry", `${cy.toFixed(2)}deg`);
      frame = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = 4 - ((e.clientY - r.top) / r.height - 0.5) * 12;
      ty = -16 + ((e.clientX - r.left) / r.width - 0.5) * 18;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 4;
      ty = -16;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", placePlane);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={stageRef} className="chs-stage" role="img" aria-label="A call to TalentFlow Sales turning into an email that is sent">
      <style>{CSS}</style>
      <div className="chs-halo" aria-hidden="true" />
      <div className="chs-shadow" aria-hidden="true" />

      <div ref={flipRef} className="chs-flip" aria-hidden="true">
        <span className="chs-chip chs-chip--call"><i /> Talk to Sales</span>
        <span className="chs-chip chs-chip--email"><i /> Message sent</span>

        {/* the phone */}
        <div className="chs-phone">
          <div className="chs-screen">
            <div className="chs-notch" />
            <div className="chs-status">
              <span>9:41</span>
              <span className="chs-bars"><i style={{ height: 3 }} /><i style={{ height: 5 }} /><i style={{ height: 7 }} /><i style={{ height: 9 }} /></span>
            </div>
            <div className="chs-call">
              <div className="chs-ring">
                <span /><span /><span />
                <div className="chs-avatar">TF</div>
              </div>
              <div className="chs-call-label">Incoming call</div>
              <div className="chs-call-name">TalentFlow Sales</div>
              <div className="chs-call-sub">Plans · demos · questions</div>
              <div className="chs-actions">
                <div className="chs-btn chs-btn--decline">
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M3.4 5.6a8.7 8.7 0 0 1 9.2 0l-.6 2.1-2.1.3-.9-1.2a5 5 0 0 0-2 0l-.9 1.2-2.1-.3-.6-2.1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" transform="rotate(135 8 8)" /></svg>
                </div>
                <div className="chs-btn chs-btn--answer">
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M3.4 5.6a8.7 8.7 0 0 1 9.2 0l-.6 2.1-2.1.3-.9-1.2a5 5 0 0 0-2 0l-.9 1.2-2.1-.3-.6-2.1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* the email */}
        <div ref={emailRef} className="chs-email">
          <div className="chs-em-head">
            <span className="chs-em-ico">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.6" width="12" height="8.8" rx="1.8" stroke="currentColor" strokeWidth="1.3" /><path d="m2.8 4.6 5.2 3.9 5.2-3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="chs-em-title">New message</span>
            <span className="chs-em-badge"><i /> Ready</span>
          </div>
          <div className="chs-em-field"><span className="k">To</span><span className="v">hello@talentflow.com</span></div>
          <div className="chs-em-field"><span className="k">From</span><span className="v">you@yourcompany.com</span></div>
          <div className="chs-em-field"><span className="k">Subject</span><span className="v">A plan for our team</span></div>
          <div className="chs-em-body">
            Hi team, we&apos;re hiring for 3 roles. Can you size a plan for us?<span className="chs-caret" />
          </div>
          <div className="chs-em-foot">
            <span className="chs-send">
              Send
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.4 8 13.6 2.8 9.6 13.4 7.4 9.6 2.4 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
            </span>
            <span className="chs-em-note">We&apos;ll get back to you</span>
          </div>
          <svg ref={planeRef} className="chs-plane" viewBox="0 0 24 24" fill="none">
            <path d="M2.8 11.4 21 3.4l-6.2 17.2-3.6-6.2-8.4-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M11.2 14.4 21 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.chs-stage { position: relative; width: 100%; height: 470px; display: flex; align-items: center; justify-content: center; perspective: 1500px; perspective-origin: 50% 48%; }
.chs-halo { position: absolute; inset: 6% 4% 4%; border-radius: 50%; pointer-events: none; filter: blur(9px);
  background: radial-gradient(closest-side, rgba(7,156,196,.15), transparent 70%), radial-gradient(closest-side, rgba(15,60,153,.08), transparent 80%); }
.chs-shadow { position: absolute; left: 50%; bottom: 34px; width: 360px; height: 60px; margin-left: -180px; border-radius: 50%; pointer-events: none; filter: blur(10px);
  background: radial-gradient(closest-side, rgba(8,19,46,.18), transparent 74%); }
.chs-flip { position: relative; flex: none; width: 420px; height: 440px; transform-style: preserve-3d; will-change: transform;
  transform: scale(var(--chs-scale, 1)) rotateX(var(--rx, 4deg)) rotateY(var(--ry, -16deg)); }

/* phone */
.chs-phone { position: absolute; left: 50%; top: 44px; width: 214px; height: 384px; margin-left: -107px; border-radius: 32px; padding: 9px;
  background: linear-gradient(160deg, #1a2544 0%, #0b1734 46%, #08132e 100%); transform-style: preserve-3d; will-change: transform, opacity;
  box-shadow: 0 1px 0 rgba(255,255,255,.18) inset, 0 0 0 1px rgba(8,19,46,.6), 0 46px 74px -34px rgba(8,31,92,.72), 0 10px 24px -12px rgba(8,31,92,.45);
  animation: chs-phone ${CYCLE_S} cubic-bezier(.65,0,.35,1) infinite; }
@keyframes chs-phone {
  0% { transform: translateZ(96px) rotateY(0) scale(1); opacity: 1; }
  34% { transform: translateZ(112px) rotateY(0) scale(1); opacity: 1; }
  44% { transform: translateZ(118px) rotateY(0) scale(1.02); opacity: 1; }
  54% { transform: translateZ(40px) rotateY(-64deg) scale(.94); opacity: .55; }
  65% { transform: translateZ(20px) rotateY(-92deg) scale(.9); opacity: 0; visibility: visible; }
  66%, 92% { transform: translateZ(20px) rotateY(-92deg) scale(.9); opacity: 0; visibility: hidden; }
  93% { transform: translateZ(20px) rotateY(-92deg) scale(.9); opacity: 0; visibility: visible; }
  100% { transform: translateZ(96px) rotateY(0) scale(1); opacity: 1; } }
.chs-screen { position: relative; width: 100%; height: 100%; border-radius: 25px; overflow: hidden; transform: translateZ(1px);
  background: linear-gradient(175deg, #f9fbff 0%, #eef3fb 62%, #e3ebf8 100%); }
.chs-notch { position: absolute; left: 50%; top: 7px; width: 74px; height: 18px; margin-left: -37px; border-radius: 999px; background: #0a1428; }
.chs-status { position: absolute; left: 0; right: 0; top: 11px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 700; color: #33415c; }
.chs-bars { display: flex; align-items: flex-end; gap: 1.5px; height: 9px; }
.chs-bars i { width: 2px; border-radius: 1px; background: #33415c; }
.chs-call { position: absolute; left: 0; right: 0; top: 54px; text-align: center; animation: chs-call ${CYCLE_S} ease-in-out infinite; }
@keyframes chs-call { 0% { transform: translateY(-8px); opacity: 0; } 10%, 44% { transform: none; opacity: 1; } 52% { transform: translateY(-6px); opacity: 0; } 100% { transform: translateY(-8px); opacity: 0; } }
.chs-ring { position: relative; width: 70px; height: 70px; margin: 0 auto; }
.chs-ring span { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(15,60,153,.34); animation: chs-ring 1.8s ease-out infinite; }
.chs-ring span:nth-child(2) { animation-delay: .4s; } .chs-ring span:nth-child(3) { animation-delay: .8s; }
@keyframes chs-ring { 0% { transform: scale(.5); opacity: .9; } 80%, 100% { transform: scale(1.32); opacity: 0; } }
.chs-avatar { position: absolute; inset: 9px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 16px; font-weight: 800; letter-spacing: -.02em;
  background: linear-gradient(145deg, #0f3c99, #079cc4); }
.chs-call-label { margin-top: 11px; font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #6b7790; }
.chs-call-name { margin-top: 4px; font-size: 15px; font-weight: 800; letter-spacing: -.02em; color: #08132e; }
.chs-call-sub { margin-top: 2px; font-size: 11px; font-weight: 500; color: #6b7790; }
.chs-actions { display: flex; justify-content: center; gap: 26px; margin-top: 18px; }
.chs-btn { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; color: #fff; animation: chs-bob 1.8s ease-in-out infinite; }
.chs-btn--decline { background: #e2453e; } .chs-btn--answer { background: #16a06a; animation-delay: .3s; }
@keyframes chs-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

/* email */
.chs-email { position: absolute; left: 50%; top: 82px; width: 300px; height: 292px; margin-left: -150px; border-radius: 18px; padding: 16px 17px 15px;
  background: var(--mkt-surface, #fff); color: var(--mkt-ink, #08132e); border: 1px solid rgba(8,19,46,.08); transform-style: preserve-3d; will-change: transform, opacity;
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 38px 62px -30px rgba(8,31,92,.55), 0 8px 18px -9px rgba(8,31,92,.2);
  animation: chs-email ${CYCLE_S} cubic-bezier(.65,0,.35,1) infinite; }
@keyframes chs-email {
  0%, 39% { transform: translateZ(-40px) rotateY(74deg) scale(.92); opacity: 0; visibility: hidden; }
  40% { transform: translateZ(-30px) rotateY(68deg) scale(.92); opacity: 0; visibility: visible; }
  56% { transform: translateZ(70px) rotateY(0) scale(1); opacity: 1; }
  64%, 88% { transform: translateZ(118px) rotateY(0) scale(1.02); opacity: 1; }
  96% { transform: translateZ(30px) rotateY(-52deg) scale(.94); opacity: .4; }
  100% { transform: translateZ(-40px) rotateY(74deg) scale(.92); opacity: 0; } }
.chs-em-head { display: flex; align-items: center; gap: 8px; padding-bottom: 11px; border-bottom: 1px solid rgba(8,19,46,.07); }
.chs-em-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; background: rgba(15,60,153,.1); color: #0f3c99; }
.chs-em-title { font-size: 12.5px; font-weight: 700; }
.chs-em-badge { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 999px; background: rgba(20,160,106,.12); color: #0b6b42; font-size: 11px; font-weight: 700; }
.chs-em-badge i { width: 5px; height: 5px; border-radius: 50%; background: #14a06a; }
.chs-em-field { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 11.5px; }
.chs-em-field .k { width: 44px; flex: none; font-weight: 600; color: #5b6779; }
.chs-em-field .v { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chs-em-body { margin-top: 12px; padding: 10px 11px; min-height: 62px; border-radius: 10px; background: rgba(8,19,46,.03); border: 1px solid rgba(8,19,46,.05); font-size: 11.5px; line-height: 1.55; color: #33415c; }
.dark .chs-em-body { color: #cbd5e1; }
.chs-caret { display: inline-block; width: 1.5px; height: 11px; margin-left: 1px; background: #0f3c99; vertical-align: -1px; animation: chs-blink 1s steps(1) infinite; }
@keyframes chs-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.chs-em-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 13px; }
.chs-send { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 999px; background: #08132e; color: #f7f8fb; font-size: 11.5px; font-weight: 600;
  animation: chs-send ${CYCLE_S} ease-in-out infinite; }
@keyframes chs-send { 0%, 60% { box-shadow: 0 0 0 0 rgba(15,60,153,0); } 70% { box-shadow: 0 0 0 6px rgba(15,60,153,.14); } 78%, 100% { box-shadow: 0 0 0 0 rgba(15,60,153,0); } }
.chs-em-note { font-size: 11.5px; font-weight: 600; color: #5b6779; }
.chs-plane { position: absolute; left: 0; top: 0; width: 26px; height: 26px; color: #079cc4; pointer-events: none; opacity: 0;
  filter: drop-shadow(0 6px 10px rgba(7,156,196,.4)); animation: chs-plane ${CYCLE_S} ease-in-out infinite; }
@keyframes chs-plane {
  0%, 70% { transform: translate(0,0) rotate(0) scale(.6); opacity: 0; }
  73% { transform: translate(10px,-4px) scale(.9); opacity: 1; }
  86% { transform: translate(300px,-96px) rotate(-16deg) scale(1.05); opacity: 1; }
  93%, 100% { transform: translate(420px,-140px) rotate(-16deg); opacity: 0; } }

/* depth chips */
.chs-chip { position: absolute; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; pointer-events: none;
  background: var(--mkt-surface, #fff); border: 1px solid rgba(8,19,46,.08); box-shadow: 0 14px 26px -18px rgba(8,31,92,.5); font-size: 11.5px; font-weight: 700; color: var(--mkt-ink, #08132e); }
.chs-chip i { width: 6px; height: 6px; border-radius: 50%; }
.chs-chip--call { left: -18px; top: 108px; transform: translateZ(150px); animation: chs-chip 5s ease-in-out infinite; }
.chs-chip--email { right: -14px; top: 246px; transform: translateZ(160px); animation: chs-chip 5s ease-in-out infinite reverse; }
.chs-chip--call i { background: #16a06a; } .chs-chip--email i { background: #079cc4; }
@keyframes chs-chip { 0%, 100% { translate: 0 0; } 50% { translate: 0 -9px; } }

@media (max-width: 1279px) { .chs-stage { height: 440px; } .chs-flip { --chs-scale: .92; } }
@media (max-width: 620px) { .chs-stage { height: 390px; } .chs-flip { --chs-scale: .8; } .chs-chip--call { left: 22px; } .chs-chip--email { right: 18px; } }
@media (max-width: 400px) { .chs-stage { height: 360px; } .chs-flip { --chs-scale: .72; } }
/* Phones: straight-on card, flatter depth; "Talk to Sales" chip sits above the card header instead of over it. */
@media (max-width: 639px) { .chs-stage { perspective: 2600px; } .chs-flip { transform: scale(calc(var(--chs-scale, 1) * .94)) rotateX(3deg) rotateY(-5deg) !important; } .chs-chip--call { left: 4px; top: 36px; } .chs-chip--email { right: 4px; } }

@media (prefers-reduced-motion: reduce) {
  .chs-stage *, .chs-stage *::before { animation: none !important; }
  .chs-phone { transform: translateZ(40px); opacity: 1; }
  .chs-email { transform: translateZ(120px) translateX(70px) translateY(40px); opacity: 1; }
  .chs-call { opacity: 1; transform: none; }
}
`;
