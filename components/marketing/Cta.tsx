"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMagnetic } from "./motion";
import { DASHBOARD_HREF, useSignedIn } from "./session";

type Variant = "primary" | "secondary" | "light" | "outlineLight";

const BASE =
  "group relative isolate inline-flex items-center justify-center overflow-hidden rounded-full font-semibold transition-[color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]";

const SIZES = {
  md: "h-11 px-5 text-sm sm:h-12 sm:px-6 sm:text-[15px]",
  sm: "h-10 px-5 text-sm",
};

/** Resting look, plus the colour of the layer that sweeps up on hover. */
const VARIANTS: Record<Variant, { button: string; fill: string }> = {
  primary: {
    button:
      "bg-mkt-ink text-mkt-canvas hover:shadow-[0_12px_30px_-12px_rgba(15,60,153,0.55)] focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-mkt-canvas",
    fill: "bg-mkt-accent",
  },
  secondary: {
    button:
      "border border-slate-900/15 text-mkt-ink hover:border-slate-900/30 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-mkt-canvas dark:border-white/15 dark:hover:border-white/30",
    fill: "bg-slate-900/[0.05] dark:bg-white/[0.07]",
  },
  light: {
    // `bg-[#fff]`, not `bg-white`: globals.css repaints `.dark .bg-white` as a
    // dark surface, which would sink this button into the navy band.
    button: "bg-[#fff] text-mkt-navy focus-visible:ring-mkt-amber focus-visible:ring-offset-mkt-navy",
    fill: "bg-mkt-amber",
  },
  outlineLight: {
    button:
      "border border-white/25 text-white hover:border-white/50 focus-visible:ring-white/60 focus-visible:ring-offset-mkt-navy",
    fill: "bg-white/10",
  },
};

/**
 * Call-to-action button/link. On hover a fill sweeps up from the bottom edge
 * and the arrow nudges toward where it goes; `magnetic` adds a slight pull
 * toward the pointer on desktop.
 */
export function Cta({
  href,
  onClick,
  children,
  variant = "primary",
  size = "md",
  arrow = "right",
  icon: Icon,
  magnetic = false,
  className = "",
  external = false,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: Variant;
  size?: keyof typeof SIZES;
  arrow?: "right" | "upRight" | null;
  /** Leading icon (e.g. Play). */
  icon?: LucideIcon;
  magnetic?: boolean;
  className?: string;
  /** Full URL off this app — no prefetch. */
  external?: boolean;
}) {
  const magnetRef = useMagnetic<HTMLElement>(magnetic ? 0.28 : 0);
  const style = VARIANTS[variant];
  const classes = `${BASE} ${SIZES[size]} ${style.button} ${className}`;

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-0 -z-10 translate-y-[101%] rounded-[inherit] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 ${style.fill}`}
      />
      <span className="relative flex items-center gap-2">
        {Icon && (
          <Icon className="h-4 w-4 transition-transform duration-300 ease-out group-hover:scale-110" />
        )}
        {children}
        {arrow === "right" && (
          <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
        )}
        {arrow === "upRight" && (
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        )}
      </span>
    </>
  );

  // The magnet only binds when asked for; otherwise the ref is left unused.
  const ref = magnetic ? magnetRef : undefined;

  if (href) {
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        prefetch={external ? false : undefined}
        className={classes}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}

/** Inline text link with an arrow that nudges on hover. */
export function ArrowLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`group inline-flex items-center gap-1.5 rounded text-sm font-semibold text-mkt-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid ${className}`}
    >
      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[length:100%_1px]">
        {children}
      </span>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
    </Link>
  );
}

/**
 * "Start free trial" that knows about sessions: proxy.ts bounces signed-in
 * visitors from /signup to the dashboard, so they get "Go to dashboard".
 */
export function TrialCta({
  magnetic = false,
  className = "",
  variant = "primary",
}: {
  magnetic?: boolean;
  className?: string;
  variant?: Variant;
}) {
  const signedIn = useSignedIn();
  return (
    <Cta href={signedIn ? DASHBOARD_HREF : "/signup"} magnetic={magnetic} variant={variant} className={className}>
      {signedIn ? "Go to dashboard" : "Start free trial"}
    </Cta>
  );
}
