"use client";

import { Link2, Mail, Users, type LucideIcon } from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, LEAD } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";

const WAYS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Mail, title: "By email", body: "Send the invite straight to a candidate’s inbox." },
  { icon: Users, title: "In bulk", body: "Invite a whole shortlist in one go." },
  { icon: Link2, title: "With a shareable link", body: "One link you can share with candidates." },
];

const TRACKED = ["Sent", "Opened", "Started", "Completed"];

export function InviteWays() {
  return (
    <div>
      <RevealHeading text="Easy invites, one click away" className={H2} />
      <RevealGroup>
        <p data-reveal className={LEAD}>
          From Resume Scoring, invite shortlisted candidates to an assessment or AI interview with
          one click.
        </p>
      </RevealGroup>

      <RevealGroup as="ul" stagger={0.08} y={24} className="mt-7 grid grid-cols-1 gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3">
        {WAYS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            data-reveal
            className="group relative overflow-hidden rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 transition-[border-color,box-shadow] duration-500 hover:border-mkt-accent/30 hover:shadow-[0_28px_56px_-32px_rgba(15,60,153,0.45)] dark:border-white/10 sm:p-7"
          >
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full bg-mkt-accent/10 text-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 motion-reduce:transition-none"
            >
              <Icon className="h-5 w-5" />
            </span>
            <h3 className={`${DISPLAY} mt-5 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`}>{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">{body}</p>
          </li>
        ))}
      </RevealGroup>

      {/* Invite tracking, as a status rail */}
      <RevealGroup y={20}>
        <div
          data-reveal
          className="mt-3 flex flex-col gap-3 rounded-[20px] border border-slate-900/[0.08] p-4 dark:border-white/10 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <p className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>
            Track every invite
          </p>
          <ol aria-label="Invite statuses" className="flex flex-wrap items-center gap-1.5">
            {TRACKED.map((status, i) => (
              <li key={status} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-3 py-1 text-[13px] font-medium ${
                    i === TRACKED.length - 1
                      ? "bg-mkt-accent-solid text-white"
                      : "bg-mkt-accent/10 text-mkt-accent"
                  }`}
                >
                  {status}
                </span>
                {i < TRACKED.length - 1 && (
                  <span aria-hidden="true" className="h-px w-3 bg-slate-900/20 dark:bg-white/20" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </RevealGroup>
    </div>
  );
}
