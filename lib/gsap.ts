"use client";

/**
 * Single GSAP entry point. Import gsap, ScrollTrigger and useGSAP from here —
 * never from "gsap" directly — so the plugins are registered exactly once and
 * only in the browser.
 *
 * Keep imports of this module inside client components that need animation
 * (e.g. the marketing landing page). That keeps GSAP out of the dashboard,
 * interview and auth bundles.
 *
 * Usage:
 *   const scope = useRef<HTMLDivElement>(null);
 *   useGSAP(() => {
 *     withMotion(() => {
 *       gsap.from(".reveal", { y: 20, autoAlpha: 0, stagger: 0.1,
 *         scrollTrigger: { trigger: ".reveal", start: "top 88%" } });
 *     });
 *   }, { scope });
 *
 * useGSAP reverts every tween/ScrollTrigger created in its callback on unmount
 * (and on React Strict Mode's double-mount), so no manual cleanup is needed.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  gsap.defaults({ duration: 0.7, ease: "power2.out" });
}

/**
 * Runs `setup` only for users who haven't asked for reduced motion. Elements
 * stay in their natural (visible) state otherwise. Call inside useGSAP so the
 * matchMedia context is reverted with the rest of the scope.
 */
export function withMotion(setup: () => void | (() => void)) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", setup);
  return mm;
}

export { gsap, ScrollTrigger, useGSAP };
