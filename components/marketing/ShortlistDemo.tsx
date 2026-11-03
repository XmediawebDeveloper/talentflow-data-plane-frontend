"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "./fonts";

/** Sample resumes from the database, in the order they were stored. Match score is 1 to 10. */
const APPLICANTS = [
  { initials: "RV", name: "Rahul Verma", role: "Frontend engineer, 4 years", score: 6 },
  { initials: "AR", name: "Ananya Rao", role: "React lead, 8 years", score: 9 },
  { initials: "TB", name: "Tom Becker", role: "Full-stack developer, 2 years", score: 3 },
  { initials: "KM", name: "Krish Menon", role: "Senior UI engineer, 7 years", score: 8 },
  { initials: "SL", name: "Sara Lindqvist", role: "JavaScript developer, 5 years", score: 5 },
  { initials: "MI", name: "Meera Iyer", role: "Staff frontend engineer, 10 years", score: 9 },
  { initials: "DA", name: "Diego Alvarez", role: "Web developer, 3 years", score: 4 },
];

/** AI Talent Match fit label for a 1–10 match score (illustrative bands). */
function fitOf(score: number) {
  if (score >= 9) return { label: "Excellent fit", tone: "bg-mkt-cyan/12 text-mkt-cyan-ink" };
  if (score >= 7) return { label: "Good fit", tone: "bg-mkt-accent/10 text-mkt-accent" };
  if (score >= 5) return { label: "Moderate fit", tone: "bg-mkt-amber/15 text-mkt-amber-ink" };
  return { label: "Low fit", tone: "bg-slate-900/[0.06] text-slate-600 dark:bg-white/10 dark:text-slate-300" };
}

const SHORTLIST_SIZE = 3;

/** Rank of each applicant (0 = best), indexed by arrival order. */
const RANKS = (() => {
  const order = APPLICANTS.map((a, i) => ({ i, score: a.score })).sort((a, b) => b.score - a.score);
  const ranks: number[] = [];
  order.forEach((entry, rank) => (ranks[entry.i] = rank));
  return ranks;
})();

const STATUS = {
  waiting: "AI Talent Match · Resume Database",
  screening: "Matching every resume to the job",
  ranking: "Ranking the best fits first",
  done: "Top 3 ready to shortlist",
};

/**
 * The hero's one orchestrated moment: AI Talent Match gives each resume a
 * 1–10 match score, the list re-sorts itself best fit first, and every row
 * gets its fit label. Reduced-motion visitors get the finished state immediately.
 */
export function ShortlistDemo() {
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const ambient = useRef<gsap.core.Timeline | null>(null);
  // The visitor's own pause outranks the on-screen auto play/pause.
  const userPaused = useRef(false);
  const onScreen = useRef(false);
  const [paused, setPaused] = useState(false);

  const sync = () => {
    const run = onScreen.current && !userPaused.current;
    if (run) {
      timeline.current?.resume();
      ambient.current?.resume();
    } else {
      timeline.current?.pause();
      ambient.current?.pause();
    }
  };

  const togglePause = () => {
    userPaused.current = !userPaused.current;
    setPaused(userPaused.current);
    sync();
  };

  useGSAP(
    () => {
      const el = root.current!;
      const mm = gsap.matchMedia();

      // Rebuilt per breakpoint: row height changes at `sm`, and the sort
      // distances are measured from the laid-out rows.
      mm.add(
        {
          // matchMedia only runs the callback when at least one condition
          // matches, so the two motion queries together cover every visitor.
          reduced: "(prefers-reduced-motion: reduce)",
          motion: "(prefers-reduced-motion: no-preference)",
          wide: "(min-width: 640px)",
        },
        (context) => {
          const rows = gsap.utils.toArray<HTMLElement>("[data-row]", el);
          const list = el.querySelector<HTMLElement>("[data-list]")!;
          const bars = gsap.utils.toArray<HTMLElement>("[data-bar]", el);
          const scores = gsap.utils.toArray<HTMLElement>("[data-score]", el);
          const chips = gsap.utils.toArray<HTMLElement>("[data-chip]", el);
          // Every row earns its fit label once the list is ranked.
          const shortlistChips = chips;
          const control = el.querySelector<HTMLElement>("[data-control]")!;
          const status = el.querySelector<HTMLElement>("[data-status]")!;
          const setStatus = (text: string) => () => {
            status.textContent = text;
          };
          const clearScores = () => scores.forEach((s) => (s.textContent = "–"));

          // Start from a clean slate: no inline opacity/transform left over
          // from a previous build (breakpoint change, hot reload), which
          // would otherwise be recorded as the starting state and leave the
          // shortlisted rows invisible.
          gsap.set([...rows, list], { clearProps: "opacity,visibility,transform,backgroundColor" });
          gsap.set(bars, { clearProps: "transform" });
          gsap.set(chips, { clearProps: "opacity,visibility,transform" });
          clearScores();
          status.textContent = STATUS.waiting;

          const tops = rows.map((row) => row.offsetTop);
          const shiftFor = (i: number) => tops[RANKS[i]] - tops[i];

          const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
          tl.call(setStatus(STATUS.screening), [], 0);

          // 1. Score each applicant in the order they applied.
          APPLICANTS.forEach((applicant, i) => {
            const at = 0.4 + i * 0.22;
            const counter = { value: 0 };
            tl.fromTo(
              rows[i],
              { backgroundColor: "rgba(7,156,196,0)" },
              { backgroundColor: "rgba(7,156,196,0.08)", duration: 0.25, yoyo: true, repeat: 1 },
              at
            )
              .fromTo(bars[i], { scaleX: 0 }, { scaleX: applicant.score / 10, duration: 0.7 }, at)
              .fromTo(
                counter,
                { value: 0 },
                {
                  value: applicant.score,
                  duration: 0.7,
                  onUpdate: () => {
                    scores[i].textContent = String(Math.round(counter.value));
                  },
                },
                at
              );
          });

          // 2. Re-sort by match.
          tl.call(setStatus(STATUS.ranking), [], ">0.15");
          tl.to(rows, {
            y: (i: number) => shiftFor(i),
            duration: 0.9,
            ease: "power3.inOut",
            stagger: 0.03,
          });

          // 3. Shortlist the top three, quiet the rest.
          tl.call(setStatus(STATUS.done), [], ">-0.1");
          tl.to(
            rows.filter((_, i) => RANKS[i] >= SHORTLIST_SIZE),
            { opacity: 0.45, duration: 0.4 },
            "<"
          );
          tl.fromTo(
            shortlistChips,
            { autoAlpha: 0, scale: 0.8 },
            { autoAlpha: 1, scale: 1, duration: 0.35, stagger: 0.08, ease: "back.out(2)" },
            "<"
          );

          timeline.current = tl;

          if (context.conditions?.reduced) {
            // The finished shortlist, still.
            tl.progress(1, true);
            APPLICANTS.forEach((applicant, i) => {
              scores[i].textContent = String(applicant.score);
            });
            status.textContent = STATUS.done;
            return;
          }

          // 4. Hold on the result, then a new pile arrives and it starts over.
          // The reset ends in exactly the state the sequence starts from, so
          // the repeat is seamless.
          //
          // Rows only ever sort (y) and dim (opacity); the fade out/in of the
          // reset happens on the list itself, so the two never fight over the
          // same property. The fade-in must not render early
          // (immediateRender: false), or it hides the rows from the start.
          tl.to(list, { autoAlpha: 0, y: 6, duration: 0.35, ease: "power1.in" }, "+=2.8");
          tl.to(shortlistChips, { autoAlpha: 0, duration: 0.2 }, "<");
          tl.set(rows, { y: 0, opacity: 1 });
          tl.set(bars, { scaleX: 0 });
          tl.call(clearScores);
          tl.call(setStatus(STATUS.waiting));
          tl.fromTo(
            list,
            { autoAlpha: 0, y: -8 },
            { autoAlpha: 1, y: 0, duration: 0.45, immediateRender: false }
          );
          tl.to({}, { duration: 0.5 });
          tl.repeat(-1);

          // The pile behind the panel breathes slowly.
          const sheets = gsap.utils.toArray<HTMLElement>("[data-sheet]", el);
          const amb = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut", duration: 3.2 } });
          amb.to(sheets[0], { rotate: 1.8, y: -5 }, 0).to(sheets[1], { rotate: -1.4, y: -3 }, 0);
          ambient.current = amb;

          gsap.set(control, { autoAlpha: 1 });

          // Play only while the panel is on screen (and not paused by hand).
          ScrollTrigger.create({
            trigger: el,
            start: "top 80%",
            end: "bottom top",
            onToggle: (self) => {
              onScreen.current = self.isActive;
              sync();
            },
          });
          onScreen.current = ScrollTrigger.isInViewport(el, 0.2);
          sync();

          return () => {
            clearScores();
            status.textContent = STATUS.waiting;
            timeline.current = null;
            ambient.current = null;
          };
        }
      );
    },
    { scope: root }
  );

  return (
    <div ref={root} className="relative">
      {/* The pile: two sheets peeking out behind the panel. */}
      <div
        aria-hidden="true"
        data-sheet
        className="absolute inset-x-6 -top-3 bottom-6 rotate-[2.5deg] rounded-[22px] border border-slate-900/[0.06] bg-mkt-surface/70 dark:border-white/[0.06]"
      />
      <div
        aria-hidden="true"
        data-sheet
        className="absolute inset-x-3 -top-1.5 bottom-3 -rotate-[1.5deg] rounded-[22px] border border-slate-900/[0.06] bg-mkt-surface/80 dark:border-white/[0.06]"
      />

      <div className="relative overflow-hidden rounded-[22px] border border-slate-900/[0.08] bg-mkt-surface shadow-[0_1px_2px_rgba(8,19,46,0.04),0_30px_60px_-30px_rgba(15,60,153,0.35)] dark:border-white/10 dark:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08] sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className={`${DISPLAY} text-[15px] font-bold tracking-[-0.01em] text-mkt-ink sm:text-base`}>
              Senior React Engineer
            </p>
            <p data-status className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
              {STATUS.waiting}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-mkt-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-mkt-cyan-ink sm:px-2.5 sm:py-1 sm:text-xs">
            Example
          </span>
        </div>

        <p className="sr-only">
          Example: AI Talent Match gives seven resumes a match score from 1 to 10, ranks the
          best fits first and labels each one an Excellent, Good, Moderate or Low fit.
        </p>
        <ol data-list aria-hidden="true" className="relative px-1.5 py-1.5 sm:px-3 sm:py-2">
          {APPLICANTS.map((applicant, i) => (
            <li
              key={applicant.name}
              data-row
              className="relative flex h-12 items-center gap-2.5 rounded-xl px-2.5 sm:h-14 sm:gap-3 sm:px-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900/[0.05] text-[10px] sm:h-8 sm:w-8 sm:text-[11px] font-semibold text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                {applicant.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-mkt-ink sm:text-sm">{applicant.name}</span>
                  <span
                    data-chip
                    className={`invisible shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold opacity-0 sm:px-2 sm:text-[11px] ${fitOf(applicant.score).tone}`}
                  >
                    {fitOf(applicant.score).label}
                  </span>
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
                  {applicant.role}
                </span>
              </span>
              <span className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full sm:w-20 bg-slate-900/[0.06] dark:bg-white/10 min-[420px]:block">
                <span
                  data-bar
                  className={`block h-full w-full origin-left scale-x-0 rounded-full ${
                    RANKS[i] < SHORTLIST_SIZE ? "bg-mkt-cyan" : "bg-slate-400 dark:bg-slate-500"
                  }`}
                />
              </span>
              <span
                data-score
                className={`${DISPLAY} w-6 shrink-0 text-right text-[13px] font-bold tabular-nums text-mkt-ink sm:w-7 sm:text-sm`}
              >
                –
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-3 border-t border-slate-900/[0.06] px-4 py-2 dark:border-white/[0.08] sm:gap-4 sm:px-6 sm:py-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">Match score 1–10 · send the shortlist to Resume Scoring</p>
          {/* The loop never ends on its own, so it can always be stopped. */}
          <button
            type="button"
            data-control
            onClick={togglePause}
            aria-pressed={paused}
            aria-label={paused ? "Play the example" : "Pause the example"}
            className="invisible inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-mkt-accent opacity-0 transition-colors hover:bg-mkt-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>
    </div>
  );
}
