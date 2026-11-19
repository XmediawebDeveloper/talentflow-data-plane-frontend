"use client";

import { KeyRound, LayoutDashboard, LifeBuoy, MessagesSquare, Palette, ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, SECTION, SHELL } from "../layout";
import { ArrowLink } from "../Cta";
import { RevealGroup, RevealHeading } from "../motion";
import { CARD, ICON_TILE } from "./shared";

/** v2 §11 — Built for Teams. */
const ITEMS = [
  { icon: UserCog, title: "Role-based access", text: "Custom roles with detailed permissions for each user." },
  { icon: MessagesSquare, title: "Teams and Team Chat", text: "Organise recruiters into teams, with public and private channels." },
  { icon: ScrollText, title: "Audit Trail", text: "Every create, update, delete and login is recorded, filterable and exportable." },
  { icon: ShieldCheck, title: "Account security", text: "Two-factor authentication, session timeouts and active-session control." },
  { icon: Palette, title: "Your brand", text: "Add your logo and colours." },
  { icon: KeyRound, title: "API access", text: "Secure API keys on Enterprise plans." },
  { icon: LayoutDashboard, title: "Smart dashboard", text: "Live KPIs and recent activity, with views for Admin, Recruiter and Billing roles." },
  { icon: LifeBuoy, title: "Support built in", text: "Raise and track support tickets from inside the app." },
];

export function TeamsSection() {
  return (
    <section aria-labelledby="teams-heading" className={SECTION}>
      <div className={SHELL}>
        <p className="text-sm font-semibold text-mkt-accent">Built for Teams</p>
        <RevealHeading id="teams-heading" text="Control, security and visibility, built in." className={`${H2} mt-2`} />

        <RevealGroup
          as="ul"
          className="mt-8 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5"
          stagger={0.06}
        >
          {ITEMS.map(({ icon: Icon, title, text }) => (
            <li key={title} data-reveal className={`${CARD} p-5 sm:p-6`}>
              <span aria-hidden="true" className={ICON_TILE}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <h3 className={`${DISPLAY} mt-4 text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
            </li>
          ))}
        </RevealGroup>
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 sm:mt-10">
          <ArrowLink href="/features">See the admin modules</ArrowLink>
          <ArrowLink href="/contact">Talk to sales</ArrowLink>
        </div>
      </div>
    </section>
  );
}
