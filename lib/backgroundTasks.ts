'use client';

import { useSyncExternalStore } from 'react';

/**
 * Background tasks that live in a page's own component (not in a context) and
 * still want a row in the shared "My Activities" dock while minimized — today a
 * minimized AI Talent Match run, and resume uploads still processing. The page
 * component registers its task when it minimizes, keeps it up to date, and
 * removes it when it reopens or unmounts.
 * The dock (GlobalScoringProgressIndicator) lists every registered task beside
 * the scoring runs and invite sends.
 */
export interface ExternalBackgroundTask {
  id: string;
  kind: 'talent-match' | 'resume-upload';
  /** What it is about — the job title. */
  title: string;
  /** 0–100. */
  pct: number;
  done: boolean;
  /** Short line under the title, e.g. "12 matching candidates found". */
  detail?: string;
  /** Reopen the task's own popup (or hand over its results). */
  onOpen: () => void;
  /** No measurable progress (AI Talent Match is one request): the row shows
   *  "Matching…" with no percentage, the same on every device. */
  indeterminate?: boolean;
  /** Finished without a result (shown red, with the reason in `detail`). */
  failed?: boolean;
  /** Finished rows from the server can be removed from the list (every device). */
  onRemove?: () => void;
  /** When it started (ms) — orders the list; in-page tasks sort first. */
  at?: number;
  /** The dock's "Clear finished" on a done task. The owner stops tracking it
   *  (and so stops re-registering it). Tasks without one are left in place. */
  onDismiss?: () => void;
}

const tasks = new Map<string, ExternalBackgroundTask>();
const listeners = new Set<() => void>();
let snapshot: ExternalBackgroundTask[] = [];
const EMPTY: ExternalBackgroundTask[] = [];

const emit = () => {
  snapshot = [...tasks.values()];
  listeners.forEach((l) => l());
};

export function upsertBackgroundTask(task: ExternalBackgroundTask) {
  tasks.set(task.id, task);
  emit();
}

export function removeBackgroundTask(id: string) {
  if (tasks.delete(id)) emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** Every registered task, re-rendering when the list changes. */
export function useExternalBackgroundTasks(): ExternalBackgroundTask[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/* AI Talent Match runs whose popup is open in THIS tab (by JD id). The dock
   leaves their server row out meanwhile — the popup (or its minimized row)
   already shows the run, and announces its finish itself. */
const localMatchJds = new Map<string, number>();
const matchListeners = new Set<() => void>();
let matchSnapshot: ReadonlySet<string> = new Set();
const emitMatch = () => {
  matchSnapshot = new Set(localMatchJds.keys());
  matchListeners.forEach((l) => l());
};
/* JD id → when its popup here closed. The server sees the finish a few
   seconds after the popup handed the results over; that finish was this
   tab's own, already announced by the popup. */
const endedMatchJds = new Map<string, number>();
export function markLocalTalentMatch(jdId: string, running: boolean) {
  const n = localMatchJds.get(jdId) ?? 0;
  if (running) localMatchJds.set(jdId, n + 1);
  else if (n <= 1) { localMatchJds.delete(jdId); endedMatchJds.set(jdId, Date.now()); }
  else localMatchJds.set(jdId, n - 1);
  emitMatch();
}
/** This tab ran (or is running) a match for this JD within `withinMs`. */
export function wasLocalTalentMatch(jdId: string, withinMs = 2 * 60 * 1000): boolean {
  if (localMatchJds.has(jdId)) return true;
  const ended = endedMatchJds.get(jdId);
  return !!ended && Date.now() - ended < withinMs;
}
const EMPTY_SET: ReadonlySet<string> = new Set();
export function useLocalTalentMatchJds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => { matchListeners.add(l); return () => { matchListeners.delete(l); }; },
    () => matchSnapshot,
    () => EMPTY_SET,
  );
}

/* Reopens the Upload History panel of the upload flow mounted on this page,
   if any (the dock's upload rows use it; otherwise they open My Resumes). */
let uploadHistoryOpener: (() => void) | null = null;
export function setUploadHistoryOpener(open: (() => void) | null, owner?: () => void) {
  // Clearing: only the one that registered (another host may have taken over).
  if (open === null && owner && uploadHistoryOpener !== owner) return;
  uploadHistoryOpener = open;
}
export function getUploadHistoryOpener(): (() => void) | null {
  return uploadHistoryOpener;
}
