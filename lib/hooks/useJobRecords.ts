import { useEffect, useState } from 'react';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import { mapJDToJob } from '@/lib/utils/jobOpeningDisplay';

/**
 * Every JD record (all versions) keyed by id, read the way the Job
 * Descriptions page and JobOpeningPickerList read it — `source: 'my-jds'`,
 * pages of 100, through the shared `mapJDToJob`. For a list whose own rows
 * don't carry the full JD (experience, salary, posted…) but should print the
 * same tags the Job Descriptions cards do. Empty until loaded; a failed load
 * leaves it empty and the caller falls back to what it already has.
 */
export function useJobRecords(enabled = true): Map<string, Job> {
  const [records, setRecords] = useState<Map<string, Job>>(() => new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        // Shared, short-lived cache (see jdService.listAllMine): a display-only
        // read, so a recent one (under 30 s, cleared by any write) is reused.
        const items = await jdService.listAllMine({ reuseRecent: true });
        if (cancelled) return;
        setRecords(new Map(items.map(mapJDToJob).map(job => [job.id, job])));
      } catch (error) {
        console.error('[useJobRecords] Failed to load job records:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return records;
}
