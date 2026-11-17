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
