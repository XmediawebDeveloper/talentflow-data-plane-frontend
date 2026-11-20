'use client';

import { useSyncExternalStore } from 'react';

/**
 * Resume uploads that must keep their place in the "Background tasks" dock
 * after the screen that started them is gone.
 *
 * Upload History lives inside `useResumeUploadFlow`, which belongs to whatever
 * screen hosts the upload (My Resumes, the Select Source popup, the invite
 * candidate picker). When that host closes, its own dock row and polling go
 * with it — while the files are still being read on the server. So a host that
 * unmounts with uploads in flight hands their batch ids over here, and
 * `GlobalUploadTracker` (mounted once in the dashboard layout) keeps following
 * them: polling, the dock row, and "View".
 *
 * Hosts that are mounted also register here, so "View" can reopen Upload
 * History in place when one is on screen instead of navigating away.
 */

let trackedBatchIds: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** Keep following these batches after their host is gone. */
export function handOffUploadBatches(ids: string[]) {
  const next = Array.from(new Set([...trackedBatchIds, ...ids.filter(Boolean).map(String)]));
  if (next.length === trackedBatchIds.length) return;
  trackedBatchIds = next;
  emit();
}

/** Stop the global follow-up (a host took over, or the row was cleared). */
export function clearTrackedUploads() {
  if (!trackedBatchIds.length) return;
  trackedBatchIds = [];
  emit();
}

const EMPTY: string[] = [];
/** The batch ids being followed globally. */
export function useTrackedUploadBatches(): string[] {
  return useSyncExternalStore(subscribe, () => trackedBatchIds, () => EMPTY);
}

/* Mounted Upload History hosts, most recent last. */
type HostOpen = (batchIds: string[]) => void;
const hosts: HostOpen[] = [];

/** A mounted host that can open Upload History in place. Returns the unregister. */
export function registerUploadHistoryHost(open: HostOpen): () => void {
  hosts.push(open);
  return () => {
    const i = hosts.lastIndexOf(open);
    if (i >= 0) hosts.splice(i, 1);
  };
}

/** Open Upload History in the most recently mounted host. False when none is mounted. */
export function openUploadHistoryInHost(batchIds: string[]): boolean {
  const open = hosts[hosts.length - 1];
  if (!open) return false;
  open(batchIds);
  return true;
}
