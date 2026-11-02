"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Calendar, Check } from "lucide-react";
import { DISPLAY } from "@/components/marketing/fonts";
import { SHELL } from "@/components/marketing/layout";
import { PageTitle, PRE, RevealGroup } from "@/components/marketing/motion";
import { MarketingPage } from "@/components/marketing/PageShell";

const FIELD =
  "block h-11 w-full rounded-xl border border-slate-900/[0.12] bg-mkt-canvas px-4 text-[15px] text-mkt-ink placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-900/25 focus:border-mkt-accent focus:bg-mkt-surface focus:outline-none focus:ring-4 focus:ring-mkt-accent/15 dark:border-white/15 dark:placeholder:text-slate-500 sm:h-12";
const LABEL = "mb-1.5 block text-sm font-medium text-mkt-ink";

const POINTS = [
  "Personalized walkthrough of all features",
  "See how AI scoring and matching works",
  "Learn about integrations with your tools",
  "Get answers to all your questions",
];

export default function DemoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: "", email: "", company: "", phone: "" });
  const set = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [key]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/signup");
  };

  return (
    <MarketingPage>
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.14),transparent)] dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.18),transparent)]"
        />
        <div
          className={`${SHELL} relative grid grid-cols-1 items-center gap-10 pb-12 pt-9 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28`}
        >
          {/* Pitch */}
          <div>
            <PageTitle
              lines={["See TalentFlow", "in action"]}
              className={`${DISPLAY} text-[clamp(2rem,6vw,4.5rem)] font-extrabold leading-[1] tracking-[-0.045em] text-mkt-ink`}
            />
            <RevealGroup immediate delay={0.5} stagger={0.1}>
              <p
                data-reveal
                data-pre
                className={`${PRE} mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-6 sm:text-xl`}
              >
                Schedule a personalized demo with our team and discover how TalentFlow can transform
                your hiring process.
              </p>
              <ul className="mt-6 space-y-3 sm:mt-9 sm:space-y-4">
                {POINTS.map((point) => (
                  <li key={point} data-reveal data-pre className={`${PRE} flex items-start gap-3`}>
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mkt-cyan/15 text-mkt-cyan-ink">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] text-slate-700 dark:text-slate-300 sm:text-base">{point}</span>
                  </li>
                ))}
              </ul>
            </RevealGroup>
          </div>

          {/* Booking form */}
          <RevealGroup immediate delay={0.35} y={40}>
            <div
              data-reveal
              data-pre
              className={`${PRE} rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 shadow-[0_40px_80px_-48px_rgba(15,60,153,0.5)] dark:border-white/10 sm:p-8 lg:p-10`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-mkt-accent-solid text-white">
                  <Calendar className="h-5 w-5" />
                </span>
                <h2 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>
                  Book your demo
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
                <div>
                  <label htmlFor="name" className={LABEL}>
                    Full name
                  </label>
                  <input id="name" placeholder="John Doe" value={formData.name} onChange={set("name")} required className={FIELD} />
                </div>
                <div>
                  <label htmlFor="email" className={LABEL}>
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="john@company.com"
                    value={formData.email}
                    onChange={set("email")}
                    required
                    className={FIELD}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <div>
                    <label htmlFor="company" className={LABEL}>
                      Company
                    </label>
                    <input id="company" placeholder="Your company" value={formData.company} onChange={set("company")} required className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor="phone" className={LABEL}>
                      Phone <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input id="phone" type="tel" placeholder="+1 (555) 123-4567" value={formData.phone} onChange={set("phone")} className={FIELD} />
                  </div>
                </div>

                <button
                  type="submit"
                  className="group relative isolate inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-mkt-ink text-sm font-semibold text-mkt-canvas transition-shadow duration-300 hover:shadow-[0_12px_30px_-12px_rgba(15,60,153,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.99] sm:h-12 sm:text-[15px]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 translate-y-[101%] rounded-[inherit] bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0"
                  />
                  Request demo
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </button>

                <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                  Or start your{" "}
                  <Link href="/signup" className="font-semibold text-mkt-accent underline-offset-4 hover:underline">
                    14-day free trial
                  </Link>{" "}
                  now
                </p>
              </form>
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
