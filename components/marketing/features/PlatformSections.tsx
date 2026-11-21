"use client";

import {
  Download,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  MessagesSquare,
  Palette,
  ScrollText,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Cta, TrialCta } from "../Cta";
import { DISPLAY } from "../fonts";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";
import { MockFrame } from "./ModuleMocks";

const BAND = `${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`;

/** Small card with an icon for the admin grid. */
function InfoCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li
      data-reveal
      className="group relative rounded-[20px] border border-slate-900/[0.08] bg-mkt-canvas p-5 transition-[translate,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-mkt-accent/30 hover:shadow-[0_24px_48px_-32px_rgba(15,60,153,0.45)] dark:border-white/10"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-mkt-accent-solid/[0.08] text-mkt-accent transition-colors duration-500 group-hover:bg-mkt-accent-solid group-hover:text-white dark:bg-white/10">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className={`${DISPLAY} mt-4 text-base font-bold tracking-[-0.015em] text-mkt-ink sm:text-[17px]`}>{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Control, security and visibility (v2 §11)
 * ------------------------------------------------------------------ */

const ADMIN: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: UserCog, title: "Role-based access", body: "Create custom roles with detailed permissions for each user." },
  {
    icon: MessagesSquare,
    title: "Teams and Team Chat",
    body: "Organise recruiters into teams, with public and private channels.",
  },
  {
    icon: ScrollText,
    title: "Audit Trail",
    body: "Every create, update, delete and login is recorded, filterable and exportable.",
  },
  {
    icon: LockKeyhole,
    title: "Account security",
    body: "Two-factor authentication, session timeouts and active-session control.",
  },
  { icon: Palette, title: "Your brand", body: "Add your logo and colours." },
  { icon: KeyRound, title: "API access", body: "Secure API keys on Enterprise plans." },
  {
    icon: LayoutDashboard,
    title: "Smart dashboard",
    body: "Live KPIs and recent activity, with different views for Admin, Recruiter and Billing roles.",
  },
  { icon: LifeBuoy, title: "Support built in", body: "Raise and track support tickets from inside the app." },
];

const PERMISSION_COLS = ["View", "Create", "Edit", "Delete"];
const PERMISSION_ROWS: { module: string; cells: boolean[] }[] = [
  { module: "Job Descriptions", cells: [true, true, true, false] },
  { module: "Resume Database", cells: [true, true, true, false] },
  { module: "Resume Scoring", cells: [true, true, false, false] },
  { module: "AI Interviews", cells: [true, false, false, false] },
];

const AUDIT = [
  { action: "Login", detail: "Recruiter 1 · 2FA verified", tone: "bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.07] dark:text-slate-300" },
  { action: "Create", detail: "Job description · Senior Backend Developer", tone: "bg-mkt-cyan/12 text-mkt-cyan-ink" },
  { action: "Update", detail: "Role · Senior Recruiter permissions", tone: "bg-mkt-accent-solid/10 text-mkt-accent dark:bg-white/10" },
  { action: "Delete", detail: "Folder · Old applicants", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-4 w-7 items-center rounded-full p-0.5 ${
        on ? "justify-end bg-mkt-accent-solid" : "justify-start bg-slate-900/15 dark:bg-white/15"
      }`}
    >
      <span className="h-3 w-3 rounded-full bg-white shadow-sm" />
    </span>
  );
}

export function AdminSection() {
  return (
    <section id="admin" aria-labelledby="admin-title" className={`${BAND} bg-mkt-surface`}>
      <div className={SHELL}>
        <RevealHeading id="admin-title" text="Control, security and visibility, built in" className={H2} />
        <RevealGroup>
          <p data-reveal className={LEAD}>
            Run your hiring team safely in one place.
          </p>
        </RevealGroup>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:mt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
          <RevealGroup as="ul" stagger={0.05} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {ADMIN.map((item) => (
              <InfoCard key={item.title} icon={item.icon} title={item.title}>
                {item.body}
              </InfoCard>
            ))}
          </RevealGroup>

          <RevealGroup y={40} stagger={0.12} className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <div data-reveal>
              <MockFrame title="Roles & Permissions" icon={<UserCog className="h-3.5 w-3.5 text-mkt-accent" />} onSurface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-mkt-ink">Senior Recruiter</span>
                  <span className="rounded-full bg-mkt-amber/12 px-2 py-0.5 text-2xs font-semibold text-mkt-amber-ink">
                    Custom role
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_repeat(4,2.25rem)] items-center gap-x-1.5 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,3.25rem)]">
                  <span />
                  {PERMISSION_COLS.map((col) => (
                    <span key={col} className="truncate text-center text-2xs font-semibold text-slate-500 dark:text-slate-400">
                      {col}
                    </span>
                  ))}
                  {PERMISSION_ROWS.map((row) => (
                    <div key={row.module} className="contents">
                      <span className="truncate text-sm text-mkt-ink">{row.module}</span>
                      {row.cells.map((on, i) => (
                        <span key={i} className="grid place-items-center">
                          <Toggle on={on} />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </MockFrame>
            </div>
            <div data-reveal>
              <MockFrame title="Audit Trail" icon={<ScrollText className="h-3.5 w-3.5 text-mkt-accent" />} onSurface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap gap-1">
                    {["All", "Create", "Update", "Delete", "Login"].map((f) => (
                      <span
                        key={f}
                        className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                          f === "All"
                            ? "bg-mkt-ink text-mkt-canvas"
                            : "border border-slate-900/10 text-slate-600 dark:border-white/15 dark:text-slate-300"
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </span>
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold text-mkt-accent">
                    <Download className="h-3 w-3" />
                    Export
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-slate-900/[0.06] dark:divide-white/[0.07]">
                  {AUDIT.map((entry) => (
                    <li key={entry.action} className="flex items-center gap-3 py-2.5 last:pb-0">
                      <span className={`w-14 shrink-0 rounded-full py-0.5 text-center text-2xs font-semibold ${entry.tone}`}>
                        {entry.action}
                      </span>
                      <span className="min-w-0 truncate text-sm text-mkt-ink">{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              </MockFrame>
            </div>
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Closing call to action (v2 §14)
 * ------------------------------------------------------------------ */

export function ClosingCta() {
  return (
    <section aria-labelledby="features-cta-title" className={BAND}>
      <div className={SHELL}>
        <RevealGroup stagger={0.1}>
          <div
            data-reveal
            className="relative overflow-hidden rounded-[24px] border border-slate-900/[0.08] bg-mkt-surface px-5 py-10 text-center dark:border-white/10 sm:px-10 sm:py-16"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p16),transparent)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-76-123-232-0p16),transparent)]"
            />
            <h2
              id="features-cta-title"
              className={`${DISPLAY} relative mx-auto max-w-2xl text-[clamp(1.6rem,4vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.035em] text-mkt-ink text-balance`}
            >
              Ready to hire smarter?
            </h2>
            <p className="relative mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-4 sm:text-lg">
              Let AI do the heavy lifting, so your team can focus on people.
            </p>
            <div className="relative mt-7 flex flex-col justify-center gap-2.5 sm:flex-row sm:gap-3">
              <TrialCta magnetic />
              <Cta href="/contact" variant="secondary" arrow={null}>
                Talk to Sales
              </Cta>
            </div>
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
