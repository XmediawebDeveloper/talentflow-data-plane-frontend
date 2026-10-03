import { useEffect, useState } from 'react';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import { mapJDToJob } from '@/lib/utils/jobOpeningDisplay';

const JD_BATCH_SIZE = 100;

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
        const first = await jdService.list({ page: 1, page_size: JD_BATCH_SIZE, source: 'my-jds' });
        const items = [...first.items];
        const totalPages = Math.max(first.total_pages || Math.ceil(first.total / JD_BATCH_SIZE), 1);
        for (let page = 2; page <= totalPages; page += 1) {
          const next = await jdService.list({ page, page_size: JD_BATCH_SIZE, source: 'my-jds' });
          items.push(...next.items);
        }
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
