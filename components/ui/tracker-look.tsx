'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Ban, CheckCircle, ChevronDown, Clock, History, Layers, Lightbulb, Loader2, Mail, Play, Undo2, Users, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tabPill } from '@/components/ui/filter-pills';
import { STATUS_HELP } from '@/components/ui/guided-tracker';
import { formatIST } from '@/lib/utils/dateUtils';

/**
 * The Invite Status Tracking popups' look (Assessment and AI Interview, the
 * `guided` popup): status tabs instead of count cards, one native checkbox
 * everywhere, a Select All pill before the search, and the Timeline / Score
 * cells. Presentation only — every count, filter and selection rule stays the
 * tracker's own; these just draw what they are given.
 */

/* ── Checkbox ─────────────────────────────────────────────────────────── */
/** The app's native `tf-checkbox`, used by the Select All pill, its menu and
 *  the table alike. `some` draws the dash (part of the scope ticked). */
export function TrackerCheckbox({ checked, some = false, ...rest }: { checked: boolean; some?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked'>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !checked; }, [some, checked]);
  return <input ref={ref} type="checkbox" className="tf-checkbox" checked={checked} {...rest} />;
}

/* ── Select All ───────────────────────────────────────────────────────── */
/** One kind of row a bulk action takes — Invited (to revoke) or Expired (to
 *  resend). The page items tick one kind; "Select all pages" ticks both, and
 *  the bulk bar then offers each kind its own button (TrackerBulkBar). */
export type TrackerSelectGroup = { key: string; label: string; action: string; ids: string[] };

/** What the Select All checkbox and the table's header checkbox do on this
 *  page. Ticked → clear. Nothing ticked → the one kind on the page; with both
 *  kinds there, `null` — the caller asks (the pill opens its menu). */
export function trackerSelection(groups: TrackerSelectGroup[], selected: Set<string>, setSelected: (next: Set<string>) => void) {
  const present = groups.filter((g) => g.ids.length > 0);
  const groupOn = (g: TrackerSelectGroup) => g.ids.length > 0 && selected.size === g.ids.length && g.ids.every((id) => selected.has(id));
  const toggle: (() => void) | null =
    selected.size > 0 ? () => setSelected(new Set())
      : present.length === 1 ? () => setSelected(new Set(present[0].ids))
        : null;
  return {
    /** A whole kind is ticked. */
    full: groups.some(groupOn),
    /** Nothing on this page can be ticked. */
    empty: present.length === 0,
    toggle,
    groupOn,
    /** Ticks just this kind (replacing the rest) — or clears it if it is already ticked. */
    pick: (g: TrackerSelectGroup) => setSelected(groupOn(g) ? new Set() : new Set(g.ids)),
  };
}

/** The toolbar pill (tabPill, h-9) holding the same checkbox as the table,
 *  and a ▾ menu: Select all pages, one item per kind (Invited / Expired) on
 *  this page, then Clear. Both kinds on the page and nothing ticked: the
 *  checkbox opens it. */
export function TrackerSelectAll({ selected, groups, onChange, allPages }: {
  /** The ticked row ids. */
  selected: Set<string>;
  groups: TrackerSelectGroup[];
  onChange: (next: Set<string>) => void;
  /** "Select all pages" — every Invited and Expired row the filters match,
   *  on every page. `count` when known up front; `checked` when all of them
   *  are ticked (picking it again clears); `onSelect` ticks them (it may load
   *  them first, `loading` meanwhile). */
  allPages?: { count?: number; checked: boolean; loading?: boolean; onSelect: () => void };
}) {
  const [open, setOpen] = useState(false);
  const sel = trackerSelection(groups, selected, onChange);
  const onClear = () => onChange(new Set());
  const item = 'w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer';
  return (
    <div className="relative shrink-0">
      <div className={`${tabPill(false)} h-9 !p-0 !gap-0`}>
        <label className={`h-full inline-flex items-center gap-2 pl-3 pr-2 ${sel.empty ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          title={sel.empty ? 'Only Invited or Expired invites can be selected' : !sel.toggle ? 'Pick Invited or Expired' : undefined}>
          <TrackerCheckbox checked={sel.full} some={selected.size > 0} disabled={sel.empty}
            onChange={() => (sel.toggle ? sel.toggle() : setOpen(true))} aria-label="Select all on this page" />
          <span className="whitespace-nowrap">{selected.size > 0 ? `${selected.size} Selected` : 'Select All'}</span>
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Selection options"
          className="h-full px-1.5 border-l border-brand-blue/10 rounded-r-lg hover:text-brand-blue">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-2 z-50">
            {allPages && (
              <label role="menuitemcheckbox" aria-checked={allPages.checked} className={`${item} ${allPages.count === 0 ? 'opacity-50 !cursor-not-allowed' : ''}`}>
                {allPages.loading
                  ? <Loader2 className="w-4 h-4 shrink-0 text-brand-blue animate-spin" />
                  : <TrackerCheckbox checked={allPages.checked} disabled={allPages.count === 0}
                      onChange={() => { if (allPages.checked) onClear(); else allPages.onSelect(); setOpen(false); }} />}
                <span className="min-w-0">
                  Select all pages{allPages.count != null ? ` (${allPages.count})` : ''}
                  <span className="flex items-center gap-1 tf-micro-hint"><Layers className="w-3 h-3" />Invited and Expired, every page</span>
                </span>
              </label>
            )}
            {groups.map((g) => (
              <label key={g.key} role="menuitemcheckbox" aria-checked={sel.groupOn(g)} className={`${item} ${g.ids.length === 0 ? 'opacity-50 !cursor-not-allowed' : ''}`}>
                <TrackerCheckbox checked={sel.groupOn(g)} disabled={g.ids.length === 0} onChange={() => { sel.pick(g); setOpen(false); }} />
                <span className="min-w-0">
                  Select {g.label} on this page ({g.ids.length})
                  <span className="block tf-micro-hint">to {g.action}</span>
                </span>
              </label>
            ))}
            <div className="border-t border-gray-200 dark:border-slate-700 my-1" />
            <button type="button" role="menuitem" disabled={selected.size === 0} onClick={() => { onClear(); setOpen(false); }}
              className={`${item} disabled:opacity-50 disabled:cursor-not-allowed`}>
              <X className="w-4 h-4 text-gray-500" />Clear selection
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Bulk bar ─────────────────────────────────────────────────────────── */
/** Once something is ticked: the count, a Revoke button for its Invited rows
 *  and a Resend button for its Expired rows — each acting on its own rows, so
 *  a mixed selection (Select all pages) still has both actions — and Clear. */
export function TrackerBulkBar({ count, revokeCount, resendCount, onRevoke, onResend, revoking, resending, onClear, revokeTitle, inline = false }: {
  count: number;
  revokeCount: number;
  resendCount: number;
  onRevoke: () => void;
  onResend: () => void;
  revoking?: boolean;
  resending?: boolean;
  onClear: () => void;
  revokeTitle?: string;
  /** Inside the filter line, right after Select All (which already shows the
   *  count): just the buttons — "Revoke (4)" / "Resend (2)" — and a ✕. */
  inline?: boolean;
}) {
  if (count === 0) return null;
  const both = revokeCount > 0 && resendCount > 0;
  if (inline) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {revokeCount > 0 && (
          <Button variant="destructive" size="sm" type="button" onClick={onRevoke} disabled={revoking} className="h-9 whitespace-nowrap"
            title={revokeTitle ?? `Revoke the ${revokeCount} selected Invited link${revokeCount === 1 ? '' : 's'}`}
            icon={revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}>
            {revoking ? 'Revoking…' : `Revoke (${revokeCount})`}
          </Button>
        )}
        {resendCount > 0 && (
          <Button variant="primary" size="sm" type="button" onClick={onResend} disabled={resending} className="h-9 whitespace-nowrap"
            title={`Resend the ${resendCount} selected Expired invitation${resendCount === 1 ? '' : 's'}`}
            icon={resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}>
            {resending ? 'Sending…' : `Resend (${resendCount})`}
          </Button>
        )}
        <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800">
          <X className="w-4 h-4" />
        </button>
        <span className="hidden lg:block h-6 w-px bg-gray-200 dark:bg-slate-700 ml-0.5" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="mx-2.5 sm:mx-6 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/15 px-3 py-2 flex-shrink-0">
      <span className="text-xs font-semibold text-brand-blue">{count} selected</span>
      {revokeCount > 0 && (
        <Button variant="destructive" size="sm" type="button" onClick={onRevoke} disabled={revoking} title={revokeTitle}
          icon={revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}>
          {revoking ? 'Revoking…' : both ? `Revoke ${revokeCount} Invited` : `Revoke (${revokeCount})`}
        </Button>
      )}
      {resendCount > 0 && (
        <Button variant="primary" size="sm" type="button" onClick={onResend} disabled={resending}
          icon={resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}>
          {resending ? 'Sending…' : both ? `Resend ${resendCount} Expired` : `Resend (${resendCount})`}
        </Button>
      )}
      <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:underline">
        <X className="w-3 h-3" />Clear
      </button>
    </div>
  );
}

/* ── Status tabs ──────────────────────────────────────────────────────── */
/* Each tab in its status chip's colour (InviteStatusChip): Invited blue, In
   Progress warning, Completed success, Expired brand orange, Terminated /
   Revoked red. Whole class names — Tailwind can't see built ones. */
type TabTone = { Icon: LucideIcon; text: string; line: string; badge: string; soft: string; hover: string };
const TAB_TONES: Record<string, TabTone> = {
  all: { Icon: Users, text: 'text-brand-blue', line: 'border-brand-blue', badge: 'bg-brand-blue text-white', soft: 'bg-brand-blue/10', hover: 'hover:text-brand-blue' },
  invited: { Icon: Mail, text: 'text-brand-blue', line: 'border-brand-blue', badge: 'bg-brand-blue text-white', soft: 'bg-brand-blue/10', hover: 'hover:text-brand-blue' },
  in_progress: { Icon: Play, text: 'text-warning-strong', line: 'border-warning-strong', badge: 'bg-warning-strong text-white', soft: 'bg-warning-subtle', hover: 'hover:text-warning-strong' },
  completed: { Icon: CheckCircle, text: 'text-success', line: 'border-success', badge: 'bg-success text-white', soft: 'bg-success-subtle', hover: 'hover:text-success' },
  expired: { Icon: Clock, text: 'text-brand-orange-deep', line: 'border-brand-orange', badge: 'bg-brand-orange text-white', soft: 'bg-brand-orange/10', hover: 'hover:text-brand-orange-deep' },
  terminated: { Icon: Ban, text: 'text-destructive', line: 'border-destructive', badge: 'bg-destructive text-white', soft: 'bg-destructive-subtle', hover: 'hover:text-destructive' },
  revoked: { Icon: Undo2, text: 'text-destructive', line: 'border-destructive', badge: 'bg-destructive text-white', soft: 'bg-destructive-subtle', hover: 'hover:text-destructive' },
};

export type TrackerTab = { key: string; label: string; value: number };

/** The status tabs — the trackers' count cards as a tab row; picking one
 *  filters the list exactly as its card did. Counts over 99 read "99+". */
export function TrackerStatusTabs({ tabs, active, onSelect }: { tabs: TrackerTab[]; active: string; onSelect: (key: string) => void }) {
  return (
    <div className="shrink-0 px-2.5 sm:px-6 pt-2 border-b border-gray-200 dark:border-slate-700">
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Filter by status">
        {tabs.map((t) => {
          const tone = TAB_TONES[t.key] ?? TAB_TONES.all;
          const on = active === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on}
              title={t.key === 'all' ? 'Everyone you invited.' : STATUS_HELP[t.key as keyof typeof STATUS_HELP]}
              onClick={() => onSelect(t.key)}
              className={`inline-flex items-center gap-2 px-3 sm:px-3.5 py-2.5 text-sm font-bold border-b-[3px] whitespace-nowrap rounded-t-lg transition-colors ${on ? `${tone.line} ${tone.text}` : `border-transparent text-gray-900 dark:text-slate-100 ${tone.hover} hover:bg-slate-50 dark:hover:bg-slate-800/50`}`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.soft}`}>
                <tone.Icon className={`w-4 h-4 ${tone.text}`} />
              </span>
              {t.label}
              <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${on ? tone.badge : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'}`}
                title={t.value > 99 ? `${t.value}` : undefined}>
                {t.value > 99 ? '99+' : t.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Under the tabs: what the picked tab means, or the tip to pick one. */
export function TrackerTabHint({ tabs, active }: { tabs: TrackerTab[]; active: string }) {
  const tab = tabs.find((t) => t.key === active);
  const tone = TAB_TONES[active] ?? TAB_TONES.all;
  const help = STATUS_HELP[active as keyof typeof STATUS_HELP];
  return (
    <p className="flex items-center gap-1.5 tf-meta min-w-0">
      <Lightbulb className="w-3.5 h-3.5 text-brand-orange shrink-0" aria-hidden="true" />
      {active === 'all' || !tab || !help
        ? 'Tip: pick a tab to see only those candidates.'
        : <span className="min-w-0"><b className={tone.text}>{tab.label}:</b> {help}</span>}
    </p>
  );
}

/* ── Table cells ──────────────────────────────────────────────────────── */
type TimelineEvent = { label: string; at: string; Icon: LucideIcon; tone: string };

/** Timeline cell: each event's icon in its tone, the label, then the time in
 *  grey — and "View full history" under them when there is more. */
export function TrackerTimeline({ events, hiddenCount = 0, onHistory }: { events: TimelineEvent[]; hiddenCount?: number; onHistory?: () => void }) {
  return (
    <div>
      {events.length === 0 ? (
        <span className="text-gray-400 dark:text-slate-500">—</span>
      ) : (
        <ul className="space-y-1">
          {events.map(({ label, at, Icon, tone }, i) => (
            <li key={`${label}-${i}`} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
              <span className="font-medium text-gray-800 dark:text-slate-200">{label}</span>
              <span className="text-gray-500 dark:text-slate-400">{formatIST(at)}</span>
            </li>
          ))}
        </ul>
      )}
      {onHistory && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onHistory(); }}
          className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-brand-blue hover:underline">
          <History className="w-3 h-3" />View full history{hiddenCount > 0 ? ` (+${hiddenCount} more)` : ''}
        </button>
      )}
    </div>
  );
}

/** Score cell: the % in a pill, green on a pass and red on a fail, with the
 *  result inside it; a grey dash (its reason as the tooltip) when empty. */
export function TrackerScorePill({ value, pass, why }: { value: number | null; pass: boolean | null; why?: string }) {
  if (value == null) return <span className="text-gray-300 dark:text-slate-600 cursor-help" title={why}>—</span>;
  const tone = pass === false
    ? 'bg-destructive-subtle text-destructive ring-destructive-line'
    : 'bg-success-subtle text-success ring-success-line';
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ring-1 whitespace-nowrap ${tone}`}>
      {Math.round(value)}%
      {pass != null && <span className="text-2xs font-medium opacity-80">{pass ? 'Pass' : 'Fail'}</span>}
    </span>
  );
}

/* ── Popup geometry ───────────────────────────────────────────────────── */
/** The popup: a fixed height under the screen's (54rem at most), header,
 *  tabs and footer fixed, and only the middle scrolling. 93rem from 2xl so a
 *  1920×1080 screen at 100% / 125% fits the table without sideways scroll.
 *  Phones keep scrolling the panel as one (`.tf-tracker-panel`, globals.css). */
export const TRACKER_LOOK_PANEL_CLASS =
  'xl:!max-w-[80rem] 2xl:!max-w-[93rem] h-[min(54rem,calc(100dvh-1.5rem))] sm:h-[min(54rem,calc(100dvh-2rem))] md:h-[min(54rem,calc(100dvh-3rem))]';
/** The middle: filters, bulk bar and table — the one part that scrolls. */
export const TRACKER_LOOK_BODY_CLASS = 'flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] flex flex-col';
