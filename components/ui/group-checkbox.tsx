"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "./utils";

export type GroupCheckState = "all" | "some" | "none";

/** all / some / none from a group's codes and the current selection. */
export const groupCheckState = (allSelected: boolean, selectedCount: number): GroupCheckState =>
  allSelected ? "all" : selectedCount > 0 ? "some" : "none";

/**
 * Section / sub-section "select all" box for permission groups.
 * all = ✓ filled, some = – (partly selected), none = empty.
 * Without `onClick` it renders a plain span so it can sit inside a clickable header.
 */
function GroupCheckbox({
  state,
  size = "md",
  label,
  onClick,
  className,
}: {
  state: GroupCheckState;
  size?: "md" | "sm";
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center rounded border transition-colors",
    size === "md" ? "h-5 w-5" : "h-4 w-4",
    state === "all" && "border-brand-blue bg-brand-blue text-white",
    state === "some" && "border-brand-blue bg-white text-brand-blue dark:bg-slate-900",
    state === "none" && "border-gray-300 bg-white hover:border-brand-blue/50 dark:border-slate-600 dark:bg-slate-900",
    className,
  );
  const icon =
    state === "all" ? (
      <Check className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={3} />
    ) : state === "some" ? (
      <Minus className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={3} />
    ) : null;
  const a11y = {
    role: "checkbox" as const,
    "aria-checked": state === "all" ? (true as const) : state === "some" ? ("mixed" as const) : (false as const),
    "aria-label": `Select all permissions for ${label}`,
    title: state === "all" ? "All selected — click to clear" : state === "some" ? "Partly selected — click to select all" : "Click to select all",
  };

  if (!onClick) return <span className={classes} {...a11y}>{icon}</span>;
  return (
    <button type="button" onClick={onClick} className={classes} {...a11y}>
      {icon}
    </button>
  );
}

export { GroupCheckbox };
