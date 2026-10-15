'use client';

import { useCallback, useRef, useState } from 'react';
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
  /**
   * Who most recently scored a resume against each version, and when — the
   * "Scored By" column on the Resume Scoring page's version history. Read
   * from the same /scoring/jd/{id} request `versionApplicants` already makes
   * (that endpoint returns newest-first, so its one row IS the latest score),
   * so this costs no extra request. `null` means the version has never been
   * scored; an unset key means the count hasn't loaded yet. `source` is the
   * raw scoring-record source field; not currently displayed anywhere.
   */
  versionScoredBy: Record<string, { name: string; scoredAt: string; source?: string } | null>;
  /** Open or close one job's history, loading it on first open. */
  toggle: (key: string, jobId: string) => void;
  /**
   * Load a lineage without opening anything — for a surface that needs the
   * version list itself (the Apply to Job dialog's version badges) rather than
   * the expanded table.
   */
  ensureLoaded: (key: string, jobId: string) => void;
  /**
   * Lineage rows per key, loaded for FILTERING — the version list the status
   * pills need in order to see past the latest version.
   *
   * Deliberately separate from `lineages` above, and deliberately thin: it
   * fetches ONLY the lineage, never the per-version JD records or scored-resume
   * counts that the expanded table pulls in. Those are two requests per version;
   * this has to run for every job on the page, so it stays at one request per
   * job. Undefined for a key means "not loaded yet", which the caller treats as
   * "no extra versions known" rather than as an empty history.
   */
  filterLineages: Record<string, JDLineageVersion[]>;
  /**
   * Load the filtering lineages for these jobs, skipping any already loaded or
   * in flight. Safe to call on every render — it is a no-op once each key has
   * landed.
   */
  ensureFilterLineages: (targets: { key: string; jobId: string }[]) => void;
  /**
   * Load resume-scored counts for these version ids, skipping any already
   * known or in flight — the same counts `versionApplicants` above holds, but
   * fetchable ahead of "View Versions" being opened. Exists so a "does this
   * lineage have anything worth showing" check can know whether an archived
   * or disabled version was ever scored (and so belongs in the history)
   * before the host decides whether to render the button at all, rather than
   * only finding out once the full lineage loads on click. Safe to call on
   * every render — a no-op once each id has landed.
   */
  ensureVersionApplicants: (versionIds: string[]) => void;
  /**
   * Authoritative version counts per JD id, from GET /jd/version-counts.
   *
   * The number a job row shows must not depend on whether a panel has been
   * opened or a prefetch has landed — that is exactly how the row and the
   * panel beneath it came to disagree. `active` excludes Draft versions (what
   * the panel lists); `total` counts every version. Unset means not loaded.
   */
  versionCounts: Record<string, { total: number; active: number }>;
  /**
   * Load counts for these JD ids, skipping any already known or in flight.
   * Batched into ONE request per call. Safe on every render.
   */
  ensureVersionCounts: (jdIds: string[]) => void;
}

export function useJobVersionLineage(): JobVersionLineage {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [lineages, setLineages] = useState<Record<string, JDLineageVersion[]>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [versionDetails, setVersionDetails] = useState<Record<string, JDResponse>>({});
  const [versionApplicants, setVersionApplicants] = useState<Record<string, number>>({});
  const [versionScoredBy, setVersionScoredBy] = useState<Record<string, { name: string; scoredAt: string; source?: string } | null>>({});
  const [filterLineages, setFilterLineages] = useState<Record<string, JDLineageVersion[]>>({});
  /* A ref, not state: this only needs to stop a second fetch for the same key
     being started before the first resolves, and putting it in state would
     re-render the whole list on every request that starts and finishes. */
  const filterLineagesInFlight = useRef<Set<string>>(new Set());
  /* Same shape as filterLineagesInFlight, for the applicant-count prefetch
     below — a ref so a request starting/finishing does not itself trigger a
     re-render. */
  const versionApplicantsInFlight = useRef<Set<string>>(new Set());
  const [versionCounts, setVersionCounts] = useState<Record<string, { total: number; active: number }>>({});
  /* Same reasoning as the two refs above: in-flight tracking must not re-render
     the list. One entry per JD id, cleared when its batch settles. */
  const versionCountsInFlight = useRef<Set<string>>(new Set());

  /* Deliberately not cached the way the JD record is: scoring a resume changes
     this number, so it is re-counted every time the panel is opened. A failure
     leaves the entry unset, so the cell keeps its dash instead of showing a
     zero that would read as "nobody applied". */
  const refreshVersionApplicants = useCallback(async (versionId: string) => {
    try {
      const scored = await scoringService.getJDScoredResumes(versionId, { page_size: 1 });
      setVersionApplicants(prev => ({ ...prev, [versionId]: scored?.total ?? 0 }));
      /* /scoring/jd/{id} returns newest-first, same as /scoring/all — so the
         single row this page_size:1 request already fetched is the most
         recent score for this version. Reused here rather than a second
         request just for the "Scored By" column. */
      const latest = scored?.items?.[0];
      setVersionScoredBy(prev => ({
        ...prev,
        [versionId]: latest
          ? { name: latest.scored_by_name || latest.scored_by || 'Unknown', scoredAt: latest.created_at, source: latest.source }
          : null,
      }));
    } catch {
      /* keep whatever was there; the cell falls back to a dash */
    }
  }, []);

  const ensureVersionApplicants = useCallback(
    (versionIds: string[]) => {
      versionIds.forEach((versionId) => {
        if (!versionId) return;
        if (Object.prototype.hasOwnProperty.call(versionApplicants, versionId)) return;
        if (versionApplicantsInFlight.current.has(versionId)) return;
        versionApplicantsInFlight.current.add(versionId);
        void refreshVersionApplicants(versionId).finally(() => {
          versionApplicantsInFlight.current.delete(versionId);
        });
      });
    },
    [versionApplicants, refreshVersionApplicants],
  );

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

  const ensureFilterLineages = useCallback(
    (targets: { key: string; jobId: string }[]) => {
      const wanted = targets.filter(({ key, jobId }) => {
        if (!key || !jobId) return false;
        if (filterLineages[key] || filterLineagesInFlight.current.has(key)) return false;
        filterLineagesInFlight.current.add(key);
        return true;
      });
      if (wanted.length === 0) return;

      /* Every write is inside a promise callback, never synchronous with the
         call — the caller runs this from an effect, and a synchronous
         setState there would cascade renders. */
      const store = (key: string, rows: JDLineageVersion[]) =>
        setFilterLineages(prev => (prev[key] ? prev : { ...prev, [key]: rows }));
      const release = (key: string) => filterLineagesInFlight.current.delete(key);

      /* One per-job request: the original path, kept as the fallback. */
      const fetchOne = ({ key, jobId }: { key: string; jobId: string }) =>
        jdService
          .getLineageVersions(jobId)
          .then((rows) => store(key, rows || []))
          .catch(() => {
            /* Cached as empty so a failing job does not re-request on every
               render. The pill then sees only what the main table gave it,
               which is the pre-existing behaviour rather than a blank list. */
            store(key, []);
          })
          .finally(() => release(key));

      /* A single job gains nothing from batching. Otherwise ONE request answers
         for every job (a page used to fire one `/jd/{id}/lineage` per job). */
      if (wanted.length === 1) {
        void fetchOne(wanted[0]);
        return;
      }
      jdService
        .getLineagesBatch(wanted.map((t) => t.jobId))
        .then((byJobId) => {
          wanted.forEach((t) => {
            const rows = byJobId[t.jobId];
            if (rows) {
              store(t.key, rows);
              release(t.key);
            } else {
              /* Not answered (e.g. the id no longer resolves): ask the per-job
                 endpoint, so behaviour matches what it did before. */
              void fetchOne(t);
            }
          });
        })
        .catch(() => {
          /* Batch endpoint unavailable (older backend, transient failure). */
          wanted.forEach((t) => void fetchOne(t));
        });
    },
    [filterLineages],
  );

  const ensureVersionCounts = useCallback(
    (jdIds: string[]) => {
      const wanted = Array.from(new Set(jdIds.filter(Boolean))).filter(
        (id) => versionCounts[id] === undefined && !versionCountsInFlight.current.has(id),
      );
      if (wanted.length === 0) return;
      wanted.forEach((id) => versionCountsInFlight.current.add(id));
      jdService
        .getVersionCounts(wanted)
        .then((counts) => {
          setVersionCounts(prev => {
            const next = { ...prev };
            wanted.forEach((id) => {
              /* An id the server did not answer for (deleted, or not this
                 tenant's) is cached as a family of one rather than left unset,
                 so it is not re-requested on every render. */
              next[id] = counts[id] ?? { total: 1, active: 1 };
            });
            return next;
          });
        })
        .catch(() => {
          /* Left UNSET on failure — unlike the id-missing case above, a failed
             request is not evidence about the job, and the row falls back to
             counting the lineage it holds rather than being pinned to a wrong 1. */
        })
        .finally(() => {
          wanted.forEach((id) => versionCountsInFlight.current.delete(id));
        });
    },
    [versionCounts],
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
    versionCounts,
    ensureVersionCounts,
    expandedKeys,
    isExpanded: (key: string) => expandedKeys.has(key),
    lineages,
    isLoading: (key: string) => loadingKeys.has(key),
    versionDetails,
    versionApplicants,
    versionScoredBy,
    toggle,
    ensureLoaded,
    filterLineages,
    ensureFilterLineages,
    ensureVersionApplicants,
  };
}
