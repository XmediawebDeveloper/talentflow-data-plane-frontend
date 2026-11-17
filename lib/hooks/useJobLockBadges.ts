'use client';

import { useEffect, useRef, useState } from 'react';
import { type JDLineageVersion } from '@/lib/services/jdService';
import { loadJobVersionLineages, jobVersionStatusesFrom } from '@/lib/utils/assessmentJobLock';
import { jobLockBadgeFor, type JobStatusBadgeKind } from '@/components/jobs/JobStatusBadge';
import { useJobStatusRefresh } from '@/lib/hooks/useJobStatusRefresh';

/**
 * The job badge (Disabled / Archived / Draft, or none for a live job) for each
 * of these JD ids — the Assessments page's Job Name badge, from the same
 * batched lineage read and the same whole-job rule (`jobLockBadgeFor`), for
 * surfaces that are not that page (the Send Invite popup).
 *
 * Kept live while mounted, so a job enabled / unarchived (or disabled /
 * archived) while the popup is open changes here without reopening it:
 *   - at once, on `JD_STATUS_CHANGED_EVENT` — this tab or, over the
 *     BroadcastChannel, another tab of the app (jdService fires it);
 *   - when the tab becomes visible again, and on a poll for a change by
 *     someone else — both throttled (see useJobStatusRefresh).
 *
 * `badgeFor` returns null until its job has loaded; `isLoaded` says whether it
 * has, so a caller can hold a choice back rather than guess.
 */
export function useJobLockBadges(jdIds: (string | null | undefined)[]) {
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [lineageById, setLineageById] = useState<Record<string, JDLineageVersion[]>>({});
  const requested = useRef(new Set<string>());
  const idsKey = Array.from(new Set(jdIds.filter((id): id is string => !!id))).sort().join(',');
  const ids = idsKey ? idsKey.split(',') : [];

  /* Reads overlap (a poll in flight when a change event fires), and an older
     read answering last must not put back the status the newer one replaced:
     each job only takes the answer of the latest read that asked for it. */
  const seq = useRef(0);
  const latestReadOf = useRef(new Map<string, number>());
  const load = (list: string[], fresh = false) => {
    if (list.length === 0) return;
    const mine = ++seq.current;
    list.forEach((id) => { requested.current.add(id); latestReadOf.current.set(id, mine); });
    loadJobVersionLineages(list, { fresh })
      .then((all) => {
        const lineages = Object.fromEntries(
          Object.entries(all).filter(([id]) => latestReadOf.current.get(id) === mine),
        );
        if (Object.keys(lineages).length === 0) return;
        setStatusById((prev) => ({ ...prev, ...jobVersionStatusesFrom(lineages) }));
        setLineageById((prev) => ({ ...prev, ...lineages }));
      })
      // Keep what is shown; the next trigger tries again.
      .catch(() => {});
  };

  useEffect(() => {
    load(ids.filter((id) => !requested.current.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Same triggers and throttle as every other job badge in the app.
  useJobStatusRefresh(() => load(ids, true));

  const badgeFor = (jdId: string | null | undefined): JobStatusBadgeKind | null =>
    jdId ? jobLockBadgeFor(statusById[jdId], lineageById[jdId]) : null;
  const isLoaded = (jdId: string | null | undefined) => !jdId || jdId in lineageById;
  return { badgeFor, isLoaded };
}
