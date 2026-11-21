'use client';

/* Support desk — the pieces both views share: badges, the filter bar, the
   conversation, the details / attachments / activity panels, the actions,
   and the resizable ticket drawer. */

import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowUpRight, Briefcase, Bug, CheckCircle2, Circle, CircleDashed, Clock3, CreditCard,
  Download, FileText, Forward, HelpCircle, Inbox, Info, KeyRound, Lightbulb, Loader2, Lock, Maximize2, MessageCircleQuestion,
  MessageSquare, Minimize2, MoreHorizontal, Paperclip, RefreshCw, ShieldCheck, Upload, User, UserCheck, Users, WifiOff, X,
  XCircle, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import NameAvatar from '@/components/ui/name-avatar';
import { formatIST } from '@/lib/utils/dateUtils';
import { can, categoriesOf, categoryLabel, priorityOptions, statusLabel, type Priority, type Reply, type Scope, type Status, type Ticket } from './model';
import type { Desk, Filters } from './useDesk';
import ReplyBox from './ReplyBox';
import { FormattedMessage } from './format';

export const dateTimeOf = (iso: string) => formatIST(iso);
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── Status / priority / category ── */
export const STATUS_STYLE: Record<Status, { dot: string; chip: string; Icon: LucideIcon; bar: string }> = {
  'open': { dot: 'bg-brand-blue', chip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', Icon: Circle, bar: 'bg-brand-blue' },
  'in-progress': { dot: 'bg-brand-orange', chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/25', Icon: CircleDashed, bar: 'bg-brand-orange' },
  'resolved': { dot: 'bg-success', chip: 'bg-success-subtle text-success ring-success/20', Icon: CheckCircle2, bar: 'bg-success' },
  'closed': { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', Icon: XCircle, bar: 'bg-gray-400' },
};
export const PRIORITY_STYLE: Record<Priority, { chip: string; dot: string; label: string }> = {
  urgent: { chip: 'bg-destructive-subtle text-destructive ring-destructive/20', dot: 'bg-destructive', label: 'Urgent' },
  high: { chip: 'bg-warning-subtle text-warning-strong ring-warning/25', dot: 'bg-warning', label: 'High' },
  medium: { chip: 'bg-brand-cyan/10 text-brand-teal ring-brand-cyan/25', dot: 'bg-brand-cyan', label: 'Medium' },
  low: { chip: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', dot: 'bg-gray-400', label: 'Low' },
};
const CATEGORY_ICON: Record<string, LucideIcon> = {
  'resume-upload': Upload, 'job-posting': Briefcase, 'candidate-management': User, 'assessment': CheckCircle2,
  'billing': CreditCard, 'technical': AlertCircle, 'feature-request': Lightbulb, 'other': MoreHorizontal,
  'account-access': KeyRound, 'permission-request': ShieldCheck, 'feature-question': MessageCircleQuestion,
  'bug-report': Bug, 'general-inquiry': HelpCircle,
};
/* Glyphs built once (no component chosen during render). */
const CATEGORY_GLYPH: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(CATEGORY_ICON).map(([k, Icon]) => [k, <Icon key={k} className="h-3.5 w-3.5" />]),
);
const STATUS_GLYPH: Record<Status, ReactNode> = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, s]) => [k, <s.Icon key={k} className="h-3 w-3" />]),
) as Record<Status, ReactNode>;
const STATUS_GLYPH_LG: Record<Status, ReactNode> = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, s]) => [k, <s.Icon key={k} className="h-4 w-4" />]),
) as Record<Status, ReactNode>;
const STATUS_TONE: Record<Status, string> = { 'open': 'text-brand-blue', 'in-progress': 'text-brand-orange-deep', 'resolved': 'text-success', 'closed': 'text-gray-500' };

export function StatusGlyph({ status }: { status: Status }) {
  return <span aria-hidden className={`inline-flex ${STATUS_TONE[status]}`}>{STATUS_GLYPH_LG[status]}</span>;
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status].chip}`}>
      {STATUS_GLYPH[status]}{statusLabel(status)}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.medium;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}
export function CategoryTag({ scope, category, plain = false }: { scope: Scope; category: string; plain?: boolean }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 ${plain ? '' : 'rounded-md bg-gray-50 px-1.5 py-0.5 ring-1 ring-inset ring-gray-200 dark:bg-slate-800 dark:ring-slate-700'}`}>
      <span className="shrink-0 text-gray-500">{CATEGORY_GLYPH[category] ?? CATEGORY_GLYPH.other}</span>
      <span className="truncate">{categoryLabel(scope, category)}</span>
    </span>
  );
}
export function WaitingTag({ t }: { t: Ticket }) {
  if (!t.waitingOn) return null;
  return t.waitingOn === 'you'
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-orange/10 px-2 py-0.5 text-[11px] font-semibold text-brand-orange-deep"><Clock3 className="h-3 w-3" />Awaiting your reply</span>
    : <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-orange/10 px-2 py-0.5 text-[11px] font-semibold text-brand-orange-deep"><AlertTriangle className="h-3 w-3" />Needs response</span>;
}
export function ForwardedTag({ t }: { t: Ticket }) {
  if (!t.forwarded) return null;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal"><Forward className="h-3 w-3" />{t.scope === 'support' ? 'Forwarded' : `Forwarded · ${t.forwarded.team ?? 'Support'}`}</span>;
}
export function UnassignedTag({ t }: { t: Ticket }) {
  if (t.scope !== 'team' || t.assignee || t.status === 'closed' || t.status === 'resolved') return null;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-warning-strong"><Users className="h-3 w-3" />Unassigned</span>;
}

/* ── States ── */
export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading tickets">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />)}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive-subtle text-destructive"><WifiOff className="h-5 w-5" /></span>
      <div><p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Couldn’t load tickets</p><p className="tf-meta mt-0.5">{message}</p></div>
      <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>Retry</Button>
    </div>
  );
}
export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue"><Inbox className="h-5 w-5" /></span>
      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</p>
      <p className="tf-meta max-w-xs">{hint}</p>
      {action}
    </div>
  );
}

/* ── Filters (server-side) ── */
export function FilterBar({ scope, f, onChange, hideStatus = false, children }: {
  scope: Scope; f: Filters; onChange: (f: Filters) => void; hideStatus?: boolean; children?: ReactNode;
}) {
  const cls = 'h-8 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideStatus && (
        <FilterSelect ariaLabel="Status" className={cls} value={f.status} onChange={v => onChange({ ...f, status: v })}
          options={[{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'Open' }, { value: 'in-progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} />
      )}
      <FilterSelect ariaLabel="Priority" className={cls} value={f.priority} onChange={v => onChange({ ...f, priority: v })}
        options={[{ value: 'all', label: 'All priorities' }, ...priorityOptions(scope).map(p => ({ value: p, label: PRIORITY_STYLE[p].label }))]} />
      {can.categoryFilter(scope) && (
        <FilterSelect ariaLabel="Category" className={cls} value={f.category} onChange={v => onChange({ ...f, category: v })}
          options={[{ value: 'all', label: 'All categories' }, ...categoriesOf(scope)]} />
      )}
      {scope === 'team' && (
        <FilterSelect ariaLabel="Assignment" className={cls} value={f.assignment} onChange={v => onChange({ ...f, assignment: v })}
          options={[{ value: 'all', label: 'All tickets' }, { value: 'mine', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }]} />
      )}
      {can.sort(scope) && !hideStatus && (
        <FilterSelect ariaLabel="Sort" className={cls} value={f.sort} onChange={v => onChange({ ...f, sort: v })}
          options={[{ value: 'default', label: 'Sort: Default' }, { value: 'newest', label: 'Newest first' }, { value: 'updated', label: 'Last updated' }, { value: 'priority', label: 'Priority (high → low)' }]} />
      )}
      {children}
    </div>
  );
}

/* ── Conversation ── */
/** Your messages on the right (the requester's in support / requests, the admin's in team). */
function Bubble({ r, scope }: { r: Reply; scope: Scope }) {
  const agent = r.role === 'agent';
  const mine = scope === 'team' ? agent : !agent;
  const agentLabel = scope === 'support' ? 'Support' : 'Admin';
  return (
    <div className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
      <NameAvatar name={r.author} size="sm" />
      <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? 'items-end text-right' : ''}`}>
        <span className="mb-1 flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-gray-900 dark:text-slate-100">{r.author}</span>
          {agent && <span className="rounded bg-brand-blue/10 px-1 text-[10px] font-semibold text-brand-blue">{agentLabel}</span>}
          <span className="text-gray-500">{dateTimeOf(r.at)}</span>
        </span>
        <div className={`break-words rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed ${!mine ? 'rounded-tl-md bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 [&_a]:text-brand-blue' : 'rounded-tr-md bg-brand-blue text-white'}`}>
          <FormattedMessage text={r.message} />
        </div>
      </div>
    </div>
  );
}

export function Conversation({ t, desk, draftKey }: { t: Ticket; desk: Desk; draftKey: string | null }) {
  const original: Reply = { id: 'desc', author: t.requester?.name ?? 'You', role: 'requester', message: t.description || '(no description)', at: t.createdAt };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {t.forwarded && (
          <div className="rounded-xl border border-brand-cyan/30 bg-brand-cyan/[0.06] p-3 text-xs text-gray-700 dark:text-slate-300">
            <p className="flex items-center gap-1.5 font-semibold text-brand-teal"><Forward className="h-3.5 w-3.5" />{t.forwarded.label}</p>
            <p className="mt-1">{[t.forwarded.number && t.scope === 'team' && `Support ticket #${t.forwarded.number}`, t.forwarded.by && `By ${t.forwarded.by}`, t.forwarded.at && dateTimeOf(t.forwarded.at), t.forwarded.requester && `Requester: ${t.forwarded.requester}`].filter(Boolean).join(' · ')}</p>
            {t.forwarded.note && <p className="mt-1 italic">“{t.forwarded.note}”</p>}
          </div>
        )}
        {[original, ...t.replies].map(r => <Bubble key={r.id} r={r} scope={t.scope} />)}
        {desk.detailLoading && <p className="flex items-center justify-center gap-2 py-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the full conversation…</p>}
        {desk.detailFailed && <p className="py-2 text-center text-xs text-destructive">Couldn’t load the full ticket — showing the summary.</p>}
      </div>
      {t.status === 'closed' ? (
        <div className="flex items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900">
          <Lock className="h-4 w-4" />{can.reopen(t.scope) ? 'This ticket is closed — reopen it to reply.' : 'This ticket is closed.'}
        </div>
      ) : (
        <ReplyBox scope={t.scope} draftKey={draftKey} onTicket={t.attachments.length} onSend={({ text, files }) => desk.actions.reply(t, text, files)} />
      )}
    </div>
  );
}

/* ── Details · attachments · activity ── */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 text-right text-gray-900 dark:text-slate-100">{children}</span>
    </div>
  );
}
export function TicketProperties({ t, desk }: { t: Ticket; desk: Desk }) {
  const editable = can.priority(t.scope) && t.status !== 'closed';
  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-800">
      <Row label="Ticket ID">#{t.number}</Row>
      <Row label="Status"><StatusBadge status={t.status} /></Row>
      <Row label="Priority">
        {editable ? (
          <FilterSelect ariaLabel="Priority" className="h-8 text-xs" value={t.priority} disabled={!!desk.actions.busy}
            onChange={v => { if (v !== t.priority) void desk.actions.setPriority(t, v as Priority); }}
            options={priorityOptions(t.scope).map(p => ({ value: p, label: PRIORITY_STYLE[p].label }))} />
        ) : <PriorityBadge priority={t.priority} />}
      </Row>
      <Row label="Category"><CategoryTag scope={t.scope} category={t.category} plain /></Row>
      {t.requester && <Row label="Requester"><span className="inline-flex items-center gap-1.5"><NameAvatar name={t.requester.name} fallback={t.requester.email} size="xs" />{t.requester.name}</span></Row>}
      <Row label={t.scope === 'support' ? 'Support agent' : 'Assigned to'}>{t.assignee ?? <span className="text-gray-500">Not assigned yet</span>}</Row>
      <Row label="Created">{dateTimeOf(t.createdAt)}</Row>
      <Row label="Last updated">{dateTimeOf(t.updatedAt)}</Row>
    </div>
  );
}
export function AttachmentsList({ t, desk }: { t: Ticket; desk: Desk }) {
  if (t.attachments.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No attachments on this ticket.</p>;
  return (
    <ul className="space-y-2">
      {t.attachments.map(a => (
        <li key={a.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-slate-700">
          <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-slate-200" title={a.name}>{a.name}</span>
          {a.size && <span className="shrink-0 text-xs text-gray-500">{a.size}</span>}
          <button type="button" aria-label={`Download ${a.name}`} title="Download" onClick={() => void desk.actions.download(t, a)}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800"><Download className="h-4 w-4" /></button>
        </li>
      ))}
    </ul>
  );
}
/** Activity from the ticket's own data (created, forwarded, replies, current status). */
export function ActivityLog({ t }: { t: Ticket }) {
  const items = [
    { at: t.createdAt, text: `${t.requester?.name ?? 'You'} created the ticket` },
    ...(t.forwarded?.at ? [{ at: t.forwarded.at, text: `${t.forwarded.by ?? 'Admin'} — ${t.forwarded.label.toLowerCase()}` }] : []),
    ...t.replies.map(r => ({ at: r.at, text: `${r.author} replied` })),
    { at: t.updatedAt, text: `Status: ${statusLabel(t.status)}` },
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="relative space-y-3 border-l border-gray-200 pl-4 dark:border-slate-700">
      {items.map((i, n) => (
        <li key={n} className="relative">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-blue ring-2 ring-white dark:ring-slate-900" />
          <p className="text-sm text-gray-800 dark:text-slate-200">{i.text}</p>
          <p className="text-[11px] text-gray-500">{dateTimeOf(i.at)}</p>
        </li>
      ))}
    </ol>
  );
}

/* ── Actions ── */
export function TicketActions({ t, desk, onForward, layout = 'row' }: { t: Ticket; desk: Desk; onForward: (t: Ticket) => void; layout?: 'row' | 'stack' }) {
  const done = t.status === 'resolved' || t.status === 'closed';
  const btn = layout === 'stack' ? 'w-full justify-center' : '';
  const { busy } = desk.actions;
  const spin = (key: string, icon: ReactNode) => (busy === `${key}:${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon);
  return (
    <div className={layout === 'stack' ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
      {can.assign(t.scope) && !t.assignee && !done && <Button size="sm" className={btn} disabled={!!busy} icon={spin('assign', <UserCheck className="h-3.5 w-3.5" />)} onClick={() => void desk.actions.assign(t)}>Assign to me</Button>}
      {can.resolve(t.scope) && !done && <Button size="sm" variant="secondary" className={btn} disabled={!!busy} icon={spin('resolve', <CheckCircle2 className="h-3.5 w-3.5" />)} onClick={() => void desk.actions.resolve(t)}>Resolve</Button>}
      {can.forward(t.scope) && !t.forwarded && <Button size="sm" variant="secondary" className={btn} disabled={!!busy} icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => onForward(t)}>Forward to support</Button>}
      {can.close(t.scope) && t.status !== 'closed' && <Button size="sm" variant="secondary" className={btn} disabled={!!busy} icon={spin('close', <XCircle className="h-3.5 w-3.5" />)} onClick={() => void desk.actions.close(t)}>Close ticket</Button>}
      {can.reopen(t.scope) && t.status === 'closed' && <Button size="sm" variant="secondary" className={btn} disabled={!!busy} icon={spin('reopen', <RefreshCw className="h-3.5 w-3.5" />)} onClick={() => void desk.actions.reopen(t)}>Reopen</Button>}
    </div>
  );
}

/* ── Ticket drawer (right side) — Table and Kanban views ──
   Resizable: drag its left edge (or focus the handle and use ← / →), the
   expand button, or double-click the edge. The width is kept in this
   browser. The layout follows the drawer's own width (container queries):
     narrow (< 760px)  tabs — Conversation · Details · Attachments · Activity
     wide   (≥ 760px)  conversation left; Details / Attachments / Activity in a side column
   Phones: always full width, no handle. */
const DRAWER_TABS = [
  { key: 'conversation', label: 'Conversation', icon: <MessageSquare className="h-4 w-4" /> },
  { key: 'details', label: 'Details', icon: <Info className="h-4 w-4" /> },
  { key: 'attachments', label: 'Attachments', icon: <Paperclip className="h-4 w-4" /> },
  { key: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
] as const;
type DrawerTab = (typeof DRAWER_TABS)[number]['key'];

const DRAWER_WIDTH_KEY = 'support-tickets:drawer-width';
const DRAWER_MIN = 420;
const DRAWER_DEFAULT = 480;
const DRAWER_WIDE = 960;
const drawerMax = () => (typeof window === 'undefined' ? 1200 : Math.max(DRAWER_MIN, window.innerWidth - 64));
const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, DRAWER_MIN), drawerMax()));
const readWidth = () => {
  try {
    const v = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
    return v ? clampWidth(v) : DRAWER_DEFAULT;
  } catch {
    return DRAWER_DEFAULT;
  }
};
const saveWidth = (w: number) => { try { localStorage.setItem(DRAWER_WIDTH_KEY, String(w)); } catch { /* private mode */ } };
const sectionTitle = (text: string, extra?: ReactNode) => (
  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{text}{extra}</p>
);

function DrawerBody({ t, desk, draftKey, onForward, onClose }: { t: Ticket; desk: Desk; draftKey: string | null; onForward: (t: Ticket) => void; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('conversation');
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const wide = width >= 760;

  // Esc closes the drawer (unless a menu / popup inside has it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // The window got smaller — keep the drawer inside it.
  useEffect(() => {
    const onResize = () => setWidth(w => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setAndSave = (w: number) => { const next = clampWidth(w); setWidth(next); saveWidth(next); };
  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const onUp = (ev: PointerEvent) => {
      setDragging(false);
      document.body.style.userSelect = prevSelect;
      saveWidth(clampWidth(window.innerWidth - ev.clientX));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const toggleWide = () => setAndSave(wide ? DRAWER_DEFAULT : DRAWER_WIDE);

  const tabPanel = tab === 'details' ? <TicketProperties t={t} desk={desk} />
    : tab === 'attachments' ? <AttachmentsList t={t} desk={desk} />
      : tab === 'activity' ? <ActivityLog t={t} /> : null;

  return (
    <aside style={{ width }}
      className={`@container relative flex h-full max-w-full flex-col bg-white shadow-2xl dark:bg-slate-900 max-sm:!w-full ${dragging ? '' : 'transition-[width] duration-200 ease-out'}`}>
      {/* Resize handle — the left edge */}
      <div role="separator" aria-orientation="vertical" aria-label="Resize ticket panel"
        aria-valuemin={DRAWER_MIN} aria-valuemax={drawerMax()} aria-valuenow={width} tabIndex={0}
        title="Drag to resize · double-click to expand / shrink"
        onPointerDown={startDrag} onDoubleClick={toggleWide}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setAndSave(width + 40); }
          if (e.key === 'ArrowRight') { e.preventDefault(); setAndSave(width - 40); }
        }}
        className="group absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none sm:flex">
        <span className={`h-full w-0.5 transition-colors ${dragging ? 'bg-brand-blue' : 'bg-transparent group-hover:bg-brand-blue/60 group-focus-visible:bg-brand-blue'}`} />
        <span className={`absolute top-1/2 flex h-10 w-3 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border bg-white shadow-sm transition-colors dark:bg-slate-900 ${dragging ? 'border-brand-blue' : 'border-gray-300 group-hover:border-brand-blue/60 dark:border-slate-600'}`}>
          {[0, 1, 2].map(i => <span key={i} className={`h-0.5 w-0.5 rounded-full ${dragging ? 'bg-brand-blue' : 'bg-gray-400'}`} />)}
        </span>
      </div>

      <header className="border-b border-gray-200 px-4 pt-4 dark:border-slate-700 @min-[760px]:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-brand-blue">#{t.number}</p>
            <h2 className="mt-0.5 text-base font-semibold leading-snug text-gray-900 dark:text-slate-50 @min-[760px]:text-lg">{t.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /><WaitingTag t={t} /><ForwardedTag t={t} /><UnassignedTag t={t} /></div>
          </div>
          <div className="hidden @min-[760px]:block"><TicketActions t={t} desk={desk} onForward={onForward} /></div>
          <button type="button" onClick={toggleWide} aria-label={wide ? 'Shrink panel' : 'Expand panel'} title={wide ? 'Shrink panel' : 'Expand panel'}
            className="hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800 sm:block">
            {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close ticket" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 @min-[760px]:hidden"><TicketActions t={t} desk={desk} onForward={onForward} /></div>
        <div role="tablist" className="mt-3 flex gap-3 overflow-x-auto @min-[760px]:hidden">
          {DRAWER_TABS.map(d => (
            <button key={d.key} type="button" role="tab" aria-selected={tab === d.key} onClick={() => setTab(d.key)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium ${tab === d.key ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200'}`}>
              {d.icon}{d.label}
              {(d.key === 'conversation' || d.key === 'attachments') && (
                <span className="rounded-full bg-gray-100 px-1.5 text-[10px] dark:bg-slate-800">{d.key === 'conversation' ? t.replies.length + 1 : t.attachments.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="hidden h-4 @min-[760px]:block" />
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] @min-[760px]:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]">
        {/* Conversation — always mounted (keeps a half-typed reply); on its tab, or always when wide */}
        <div className={`${tab === 'conversation' ? 'flex' : 'hidden'} min-h-0 flex-col bg-slate-50/50 dark:bg-slate-950/30 @min-[760px]:flex`}>
          <Conversation t={t} desk={desk} draftKey={draftKey} />
        </div>
        {tabPanel && <div className="overflow-y-auto p-4 @min-[760px]:hidden">{tabPanel}</div>}
        <aside className="hidden min-h-0 space-y-6 overflow-y-auto border-l border-gray-200 p-5 dark:border-slate-700 @min-[760px]:block">
          <section>{sectionTitle('Details')}<TicketProperties t={t} desk={desk} /></section>
          <section>
            {sectionTitle('Attachments', <span className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-600 dark:bg-slate-800">{t.attachments.length}</span>)}
            <AttachmentsList t={t} desk={desk} />
          </section>
          <section>{sectionTitle('Activity')}<ActivityLog t={t} /></section>
        </aside>
      </div>
    </aside>
  );
}

/** The open ticket in a resizable right-side drawer. Esc or the backdrop closes it. */
export function TicketDrawer({ desk, meId, onForward }: { desk: Desk; meId?: string; onForward: (t: Ticket) => void }) {
  const t = desk.detail;
  if (!t) return null;
  const close = () => void desk.open(null);
  const area = t.scope === 'requests' ? 'helpdesk' : t.scope;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ticket ${t.number}`}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-slate-900/30" onClick={close} />
      <DrawerBody key={t.id} t={t} desk={desk} draftKey={meId ? `${meId}:${area}:${t.id}` : null} onForward={onForward} onClose={close} />
    </div>
  );
}
