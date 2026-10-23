import { useEffect, useState } from 'react';
import { jdService } from '@/lib/services/jdService';
import type { JDLocation } from '@/lib/services/jdService';

/** One in-flight/settled lookup per JD, shared by every card on the page. */
const cache = new Map<string, Promise<JDLocation[]>>();

/**
 * Every saved location of a JD.
 *
 * AI Interview configs only store `jd_location`, the first city, so a JD with
 * several locations read as one place (or, split at its comma, as the city and
 * its state). The JD record is the source of truth. Returns `null` until it
 * loads, or when it cannot be read — callers fall back to the flat string.
 */
export function useJdLocations(jdId?: string | null): JDLocation[] | null {
  const [locations, setLocations] = useState<JDLocation[] | null>(null);

  useEffect(() => {
    if (!jdId) {
      setLocations(null);
      return;
    }
    let cancelled = false;
    let pending = cache.get(jdId);
    if (!pending) {
      pending = jdService.get(jdId).then((jd) => jd.locations || []);
      cache.set(jdId, pending);
      pending.catch(() => cache.delete(jdId));
    }
    pending.then((rows) => { if (!cancelled) setLocations(rows.length ? rows : null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [jdId]);

  return locations;
}
