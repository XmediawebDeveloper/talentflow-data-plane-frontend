"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { gsap, useGSAP, withMotion } from "@/lib/gsap";
import { DISPLAY } from "@/components/marketing/fonts";
import { H2, SECTION, SHELL } from "@/components/marketing/layout";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

const JOBS = [
  { title: "Senior Frontend Engineer", location: "Remote", type: "Full-time", department: "Engineering" },
  { title: "Product Designer", location: "San Francisco, CA", type: "Full-time", department: "Design" },
  { title: "Sales Development Representative", location: "New York, NY", type: "Full-time", department: "Sales" },
  { title: "Customer Success Manager", location: "Remote", type: "Full-time", department: "Customer Success" },
  { title: "Data Scientist", location: "Remote", type: "Full-time", department: "Engineering" },
  { title: "Marketing Manager", location: "San Francisco, CA", type: "Full-time", department: "Marketing" },
];

const DEPARTMENTS = ["All", ...Array.from(new Set(JOBS.map((job) => job.department)))];

export default function CareersPage() {
  const [department, setDepartment] = useState("All");
  const listRef = useRef<HTMLUListElement>(null);
  const firstRender = useRef(true);

  const shown = department === "All" ? JOBS : JOBS.filter((job) => job.department === department);

  // Re-filtering re-deals the list so it's clear what changed.
  useGSAP(
    () => {
      if (firstRender.current) {
        firstRender.current = false;
        return;
      }
      withMotion(() => {
        gsap.fromTo(
          listRef.current!.children,
          { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.05, ease: "power3.out" }
        );
      });
    },
    { dependencies: [department] }
  );

  return (
    <MarketingPage>
      <PageHero
        lines={["Join our team"]}
        lead="Help us transform the future of recruiting. We're always looking for talented people to join our mission."
      />

      <section className={`${SECTION} border-t border-slate-900/[0.07] !pt-10 dark:border-white/[0.08] sm:!pt-16`}>
        <div className={SHELL}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <RevealHeading text="Open positions" className={H2} />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 sm:text-[15px]">
                {shown.length} {shown.length === 1 ? "role" : "roles"}
                {department !== "All" && ` in ${department}`}
              </p>
            </div>

            {/* Department filter — scrolls sideways on phones */}
            <div
              role="group"
              aria-label="Filter by department"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {DEPARTMENTS.map((name) => {
                const selected = name === department;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDepartment(name)}
                    className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid ${
                      selected
                        ? "border-transparent bg-mkt-ink text-mkt-canvas"
                        : "border-slate-900/15 text-slate-600 hover:border-slate-900/30 hover:text-mkt-ink dark:border-white/15 dark:text-slate-300"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <RevealGroup stagger={0.07} y={24} className="mt-6 sm:mt-10">
            <ul ref={listRef} className="border-t border-slate-900/[0.08] dark:border-white/10">
              {shown.map((job) => (
                <li key={job.title} data-reveal className="border-b border-slate-900/[0.08] dark:border-white/10">
                  <Link
                    href="/contact"
                    prefetch={false}
                    className="group relative flex flex-col gap-3 py-5 transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-4 sm:py-7 sm:hover:bg-mkt-surface"
                  >
                    <div className="min-w-0">
                      <span className="inline-block rounded-full bg-mkt-accent-solid/[0.08] px-2.5 py-0.5 text-xs font-semibold text-mkt-accent dark:bg-white/10">
                        {job.department}
                      </span>
                      <h3
                        className={`${DISPLAY} mt-2 text-lg font-bold tracking-[-0.02em] text-mkt-ink transition-transform duration-300 ease-out group-hover:translate-x-1 sm:text-2xl`}
                      >
                        {job.title}
                      </h3>
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {job.type}
                        </span>
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-900/15 px-4 py-2 text-sm font-semibold text-mkt-ink transition-[background-color,border-color,color] duration-300 group-hover:border-mkt-ink group-hover:bg-mkt-ink group-hover:text-mkt-canvas dark:border-white/15 sm:self-center">
                      Apply now
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
