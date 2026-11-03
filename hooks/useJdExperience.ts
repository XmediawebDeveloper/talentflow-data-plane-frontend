import { useEffect, useState } from 'react';
import { jdService } from '@/lib/services/jdService';
import { formatJdExperience } from '@/lib/utils/jobExperience';

type JdExperienceFields = {
  job_level?: string | null;
  experience_level?: string | null;
  experience_min?: number | null;
  experience_max?: number | null;
};

/** One in-flight/settled lookup per JD, shared by every card on the page. */
const cache = new Map<string, Promise<JdExperienceFields>>();

/**
 * A JD's experience, worded by the shared `formatJdExperience` (level name +
 * the JD's own years, or "Senior Level (years not stated)").
 *
 * AI Interview configs snapshot only `jd_experience_level` (the level code),
 * never the years, so on their own they can only show "Senior" - while the
 * JD page shows the years, or says none were stated. The JD record is the
 * source of truth. Returns `null` until it loads or when it cannot be read;
 * callers fall back to `fallbackLevel` worded the same way.
 */
export function useJdExperience(jdId?: string | null, fallbackLevel?: string | null): string | null {
  const [fields, setFields] = useState<JdExperienceFields | null>(null);

  useEffect(() => {
    if (!jdId) {
      setFields(null);
      return;
    }
    let cancelled = false;
    let pending = cache.get(jdId);
    if (!pending) {
      pending = jdService.get(jdId).then((jd) => jd as unknown as JdExperienceFields);
      cache.set(jdId, pending);
      pending.catch(() => cache.delete(jdId));
    }
    pending.then((row) => { if (!cancelled) setFields(row); }).catch(() => {});
    return () => { cancelled = true; };
  }, [jdId]);

  if (fields) {
    return formatJdExperience(
      {
        jobLevel: fields.job_level || fields.experience_level || fallbackLevel,
        experienceMin: fields.experience_min,
        experienceMax: fields.experience_max,
      },
      { includeLevel: true },
    ) || null;
  }
  return fallbackLevel ? formatJdExperience({ jobLevel: fallbackLevel }) || null : null;
}
