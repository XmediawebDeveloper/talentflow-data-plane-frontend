'use client';

import { useCallback, useState } from 'react';
import { jdService, JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';

/**
 * The "View Versions" panel's data, shared by the Job Openings list and the
 * Apply to Job dialog so both open the same history from the same endpoints.
 *
 * Lineage comes from GET /jd/{id}/lineage — the authoritative answer to "what
 * versions does this job have". Deliberately NOT derived from the rows on
 * screen: whether the list endpoint returns every version or only the latest is
 * its own business, and gating the feature on that made the control disappear
 * whenever it returned one row per job.
 */
export interface JobVersionLineage {
  /** Lineage keys whose history is open. A Set, so several can be open at once. */
  expandedKeys: Set<string>;
  isExpanded: (key: string) => boolean;
  /** Cached lineage per key. Undefined until the first load lands. */
  lineages: Record<string, JDLineageVersion[]>;
  isLoading: (key: string) => boolean;
  /**
   * Full JD record per version id. The lineage endpoint only carries
   * id/title/version/status/dates, but the table also shows experience,
   * industry, work mode and author — fetched once per version. A version whose
   * fetch fails simply shows dashes; nothing is invented client-side.
   */
  versionDetails: Record<string, JDResponse>;
  /**
   * Resumes actually scored against each version. The JD record's own
   * applicants_count comes back as 0 on version rows, so this is counted from
   * /scoring/jd/{id} — the endpoint the Scored Resumes tab lists from.
   */
  versionApplicants: Record<string, number>;
  /** Open or close one job's history, loading it on first open. */
  toggle: (key: string, jobId: string) => void;
  /**
   * Load a lineage without opening anything — for a surface that needs the
   * version list itself (the Apply to Job dialog's version badges) rather than
   * the expanded table.
   */
  ensureLoaded: (key: string, jobId: string) => void;
}

export function useJobVersionLineage(): JobVersionLineage {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [lineages, setLineages] = useState<Record<string, JDLineageVersion[]>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [versionDetails, setVersionDetails] = useState<Record<string, JDResponse>>({});
  const [versionApplicants, setVersionApplicants] = useState<Record<string, number>>({});

  /* Deliberately not cached the way the JD record is: scoring a resume changes
     this number, so it is re-counted every time the panel is opened. A failure
     leaves the entry unset, so the cell keeps its dash instead of showing a
     zero that would read as "nobody applied". */
  const refreshVersionApplicants = useCallback(async (versionId: string) => {
    try {
      const scored = await scoringService.getJDScoredResumes(versionId, { page_size: 1 });
      setVersionApplicants(prev => ({ ...prev, [versionId]: scored?.total ?? 0 }));
    } catch {
      /* keep whatever was there; the cell falls back to a dash */
    }
  }, []);

  const loadLineage = useCallback(
    async (key: string, jobId: string, alreadyCached: boolean, alreadyLoading: boolean) => {
      if (alreadyCached || alreadyLoading) return;
      setLoadingKeys(prev => new Set(prev).add(key));
      try {
        const lineage = await jdService.getLineageVersions(jobId);
        setLineages(prev => ({ ...prev, [key]: lineage || [] }));
        // Enrich each version with its own JD record, in parallel; every result
        // lands as it arrives so the table fills in progressively.
        (lineage || []).forEach((version) => {
          jdService
            .getById(version.id)
            .then((full) => {
              setVersionDetails(prev => (prev[version.id] ? prev : { ...prev, [version.id]: full }));
            })
            .catch(() => { /* row falls back to the lineage fields + dashes */ });

          void refreshVersionApplicants(version.id);
        });
      } catch {
        // Leave it uncached so the next expand retries rather than showing an
        // empty history as if the job genuinely had one version.
        setLineages(prev => ({ ...prev, [key]: [] }));
      } finally {
        setLoadingKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [refreshVersionApplicants],
  );

  const toggle = useCallback(
    (key: string, jobId: string) => {
      const wasExpanded = expandedKeys.has(key);
      setExpandedKeys(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (!wasExpanded) {
        const cached = lineages[key];
        void loadLineage(key, jobId, !!cached, loadingKeys.has(key));
        /* loadLineage bails out once a lineage is cached, which would leave the
           applicant counts frozen at whatever they were the first time the panel
           was opened. Re-count the cached versions here so reopening picks up
           resumes scored in between. */
        if (cached?.length) cached.forEach(v => void refreshVersionApplicants(v.id));
      }
    },
    [expandedKeys, lineages, loadingKeys, loadLineage, refreshVersionApplicants],
  );

  const ensureLoaded = useCallback(
    (key: string, jobId: string) => {
      void loadLineage(key, jobId, !!lineages[key], loadingKeys.has(key));
    },
    [lineages, loadingKeys, loadLineage],
  );

  return {
    expandedKeys,
    isExpanded: (key: string) => expandedKeys.has(key),
    lineages,
    isLoading: (key: string) => loadingKeys.has(key),
    versionDetails,
    versionApplicants,
    toggle,
    ensureLoaded,
  };
}
