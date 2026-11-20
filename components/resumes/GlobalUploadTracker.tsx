'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resumeService } from '@/lib/services/resumeService';
import { removeBackgroundTask, upsertBackgroundTask } from '@/lib/backgroundTasks';
import { clearTrackedUploads, openUploadHistoryInHost, useTrackedUploadBatches } from '@/lib/uploadTracker';

const TASK_ID = 'resume-upload:global';
const POLL_MS = 4000;

type BatchSummary = { id: string; total: number; pending: number; processing: boolean; added: number; failed: number };

/**
 * Follows resume uploads whose screen was closed (see lib/uploadTracker): one
 * "Upload History" row in the Background tasks dock, kept up to date until the
 * files are processed and the row is cleared. "View" reopens Upload History —
 * in place when a host is on screen, otherwise on My Resumes.
 * Mounted once in the dashboard layout; renders nothing itself.
 */
export default function GlobalUploadTracker() {
  const router = useRouter();
  const batchIds = useTrackedUploadBatches();
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const idsRef = useRef(batchIds);
  useEffect(() => { idsRef.current = batchIds; });

  /* Poll the tracked batches until none is still running. */
  useEffect(() => {
    if (!batchIds.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await resumeService.listUploadBatches(50);
        if (cancelled) return;
        const wanted = new Set(batchIds);
        const next: BatchSummary[] = (res?.batches ?? [])
          .filter((b: { id: string }) => wanted.has(String(b.id)))
          .map((b: { id: string; total_files?: number; pending?: number; status?: string; completed?: number; versions?: number; errors?: number }) => ({
            id: String(b.id),
            total: b.total_files ?? 0,
            pending: b.pending ?? 0,
            processing: b.status === 'processing',
            added: (b.completed ?? 0) + (b.versions ?? 0),
            failed: b.errors ?? 0,
          }));
        setSummaries(next);
        const running = next.some(s => s.processing || s.pending > 0);
        // Batches not listed yet (just created) count as running.
        if (running || next.length < batchIds.length) timer = setTimeout(load, POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(load, POLL_MS * 2);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [batchIds]);

  /* The dock row. */
  useEffect(() => {
    if (!batchIds.length) { removeBackgroundTask(TASK_ID); return; }
    // Only this hand-off's batches (an earlier, cleared one may still be in state).
    const current = summaries.filter(s => batchIds.includes(s.id));
    const running = current.filter(s => s.processing || s.pending > 0);
    const waitingForList = current.length < batchIds.length;
    const total = running.reduce((n, s) => n + s.total, 0);
    const left = running.reduce((n, s) => n + s.pending, 0);
    const added = current.reduce((n, s) => n + s.added, 0);
    const failed = current.reduce((n, s) => n + s.failed, 0);
    const done = !waitingForList && running.length === 0;
    const fmt = (v: number) => v.toLocaleString('en-IN');
    upsertBackgroundTask({
      id: TASK_ID,
      kind: 'resume-upload',
      title: 'Upload History',
      pct: done ? 100 : total > 0 ? Math.round(((total - left) / total) * 100) : 0,
      done,
      detail: done
        ? `${fmt(added)} uploaded${failed ? ` · ${fmt(failed)} failed` : ''}`
        : total > 0 ? `${fmt(total - left)}/${fmt(total)} processed` : 'Processing…',
      onOpen: () => {
        const ids = idsRef.current;
        // A host on screen takes the follow-up over (its own row / polling);
        // otherwise My Resumes opens Upload History for the latest batch.
        clearTrackedUploads();
        if (!openUploadHistoryInHost(ids)) {
          const last = ids[ids.length - 1];
          router.push(`/recruitment/resume-database?tab=my-resumes${last ? `&batch_id=${encodeURIComponent(last)}` : ''}`);
        }
      },
      onDismiss: () => clearTrackedUploads(),
    });
  }, [batchIds, summaries, router]);

  useEffect(() => () => removeBackgroundTask(TASK_ID), []);

  return null;
}
