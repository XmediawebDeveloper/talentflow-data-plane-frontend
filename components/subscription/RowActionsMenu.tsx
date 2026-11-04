"use client";

/**
 * RowActions — the Actions-column control for the subscription history tables
 * (Billing / Refund / Dispute / Unit Disputes).
 *
 * Responsive by design:
 *  - ≥ sm: the inline buttons exactly as before (a labelled "primary" pill plus
 *    icon-only "default" buttons), so desktop/tablet is unchanged.
 *  - < sm (phones): the sticky Actions column is too narrow for a row of
 *    buttons, so everything collapses into a single three-dots (⋯) menu that
 *    opens the same actions as a dropdown.
 *
 * Driven by one `actions` array so every table renders an identical control —
 * define each action once and both layouts stay in step.
 *
 * The menu uses the shared Radix DropdownMenu, which portals its panel to the
 * body — so it is never clipped by the table's `overflow-x-auto` or the sticky
 * column, and it closes on outside-click / Esc for free.
 */

import * as React from "react";
import { MoreHorizontal, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type RowActionVariant = "primary" | "default" | "destructive";

export type RowAction = {
  /** Stable key for React lists. */
  key: string;
  /** Visible label (desktop pill text, menu item text, and aria-label). */
  label: string;
  /** Lucide icon component. */
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  /** Swaps the icon for a spinner and blocks re-clicks. */
  loading?: boolean;
  /**
   * primary     → labelled brand-blue pill (e.g. "View")
   * default     → icon-only square (e.g. "Download")
   * destructive → red menu item (menu only)
   */
  variant?: RowActionVariant;
};

export function RowActions({
  actions,
  menuLabel = "Actions",
  emptyFallback = <span className="tf-hint">—</span>,
}: {
  actions: RowAction[];
  menuLabel?: string;
  emptyFallback?: React.ReactNode;
}) {
  if (actions.length === 0) return <>{emptyFallback}</>;

  return (
    <>
      {/* ≥ sm — inline buttons (unchanged desktop/tablet layout) */}
      <div className="hidden items-center justify-end gap-1.5 sm:flex">
        {actions.map((a) => {
          const Icon = a.loading ? Loader2 : a.icon;
          const iconCls = `h-3.5 w-3.5 ${a.loading ? "animate-spin" : ""}`;
          if (a.variant === "primary") {
            return (
              <button
                key={a.key}
                type="button"
                onClick={a.onClick}
                disabled={a.disabled || a.loading}
                className="inline-flex items-center gap-1 rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-2.5 py-1.5 text-xs font-medium text-brand-blue transition-all hover:-translate-y-0.5 hover:bg-brand-blue/[0.08] disabled:opacity-50"
                aria-label={a.label}
                title={a.label}
              >
                <Icon className={iconCls} />
                {a.label}
              </button>
            );
          }
          return (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled || a.loading}
              className="tf-btn tf-btn-secondary h-8 w-8 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-[border-color,box-shadow,color,background-color] hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue whitespace-normal gap-0 font-normal"
              aria-label={a.label}
              title={a.label}
            >
              <Icon className={iconCls} />
            </button>
          );
        })}
      </div>

      {/* < sm — three-dots (⋯) menu */}
      <div className="flex justify-end sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="tf-btn tf-btn-secondary h-8 w-8 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-colors hover:border-brand-blue/25 hover:bg-brand-blue/[0.04] hover:text-brand-blue focus:ring-2 focus:ring-brand-blue/30 whitespace-normal gap-0 font-normal"
              aria-label={menuLabel}
              title={menuLabel}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {actions.map((a) => {
              const Icon = a.loading ? Loader2 : a.icon;
              return (
                <DropdownMenuItem
                  key={a.key}
                  disabled={a.disabled || a.loading}
                  variant={a.variant === "destructive" ? "destructive" : "default"}
                  onSelect={() => a.onClick()}
                  className="gap-2 tf-body"
                >
                  <Icon className={`h-4 w-4 ${a.loading ? "animate-spin" : ""}`} />
                  {a.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export default RowActions;
