import { assessmentService, AssessmentResponse } from '@/lib/services/assessmentService';
import { jdService, JDLineageVersion } from '@/lib/services/jdService';

/**
 * The Job Opening → Job Version → Assessment retrieval, as ONE implementation.
 *
 * Every surface that reports on a whole job (the Job List row's Track, the
 * page-level Invitation Status and Candidate Results tabs) has to answer the
 * same question — "what does this job actually contain" — and each one used to
 * answer it for itself. The two mistakes that kept producing were always the
 * same, so they are fixed here once:
 *
 *   1. ONE REQUEST PER JOB VERSION, never one for the job. Every republish is
 *      its own JD row with its own id, and `GET /assessments?jd_id=` matches
 *      that id exactly — so a single request only ever answers for the one
 *      version it named, and every assessment authored against a SIBLING
 *      version is simply absent from the reply. Asking per version removes the
 *      assumption instead of betting on it; if the endpoint ever widens the
 *      filter to the lineage, the extra copies arrive as duplicates and the
 *      dedupe drops them.
 *
 *   2. WHICH VERSION AN ASSESSMENT BELONGS TO IS RESOLVED FROM THE JD ROW IT
 *      POINTS AT, not from its own `jd_version`. That field is a snapshot the
 *      backend stamps at creation and it comes back as 1 for assessments
 *      authored against a later version, so reading it first labels every row
 *      V1 — the assessment then renders under the wrong job version. Same
 *      precedence the rest of the app already follows (`jobVersionOf` in
 *      AssessmentVersionHistoryPanel, the Job Version scope in
 *      AssessmentResults): id first, number only as the fallback.
 *
 * The structure is built from the JOB side and candidate data is attached to it
 * afterwards, never the other way round — an assessment with zero invitations
 * is still an assessment of that job version, and deriving the tree from
 * candidate records is what makes it disappear.
 */

/**
 * Most assessment versions one JOB VERSION (one JD row) may hold - archived ones
 * excluded, since archiving is how a recruiter makes room. Counted per JD row:
 * a job's v3 at the cap leaves its v2 free. The JD page's Create Assessment
 * stops here; the backend's publish blocks a 6th.
 */
export const MAX_ASSESSMENT_VERSIONS = 5;

/** One job version, with every assessment authored against it. */
export interface JobVersionAssessments {
  /** This version's own JD row id — the join key, not the job's lineage key. */
  jdId: string;
  /** 1, 2, 3… as the JD's own lineage numbers it. */
  versionNumber: number;
  /** From the lineage row, when the lineage answered for this version. */
  title?: string;
  status?: string;
  isLatestVersion?: boolean;
  /**
   * Assessments of THIS version, newest assessment version first. Empty is a
   * real answer: the version exists and has none yet.
   */
  assessments: AssessmentResponse[];
}

export interface JobAssessmentHierarchy {
  /** The JD row the hierarchy was requested for. */
  requestedJdId: string;
  /** Every JD row of this job — one per job version, the requested one included. */
  jdIds: string[];
  /** The job's lineage as the JD service returned it (empty if it failed). */
  lineage: JDLineageVersion[];
  /** Oldest version first, versions with no assessments kept. */
  versions: JobVersionAssessments[];
  /** Every assessment of the job, deduped by assessment id. */
  assessments: AssessmentResponse[];
  /** JD row id → job version number. */
  jobVersionByJdId: Map<string, number>;
  /** Assessment id → the job version number it belongs to. */
  jobVersionByAssessmentId: Map<string, number>;
  /**
   * False when the lineage request failed, so the hierarchy could only be built
   * from the requested JD row. Callers that must not present a partial job can
   * say so; everything still renders, one version deep.
   */
  lineageResolved: boolean;
}

/**
 * A job version holds a handful of assessments (the create flow caps duplicates
 * per lineage in single digits), so one page is the whole set. Paged anyway
 * rather than trusted: a truncated reply is a missing assessment, which is the
 * exact failure this module exists to prevent.
 */
const ASSESSMENTS_PAGE_SIZE = 100;

/** How many lineage lookups run at once in the per-job fallback of
 *  `resolveJobVersionsByJdId`. */
const LINEAGE_LOOKUP_CONCURRENCY = 6;

/** Ids per `/jd/version-map` request. The backend caps a request at 200; staying
 *  at it keeps a page of jobs to one request and a crafted list to a few. */
const VERSION_MAP_BATCH = 200;

/**
 * Every assessment matching `params`, following the pager to the end.
 *
 * Returns `[]` on failure rather than throwing: one job version failing must
 * never empty the others, and every caller here merges across versions.
 *
 * Exported for the cross-job tabs, which list every assessment in the tenant
 * rather than one job's. They asked for a single fixed page, so a tenant past
 * that size lost assessments — and with them their candidates — off the end of
 * the reply.
 */
export async function listAllAssessments(params: { jd_id?: string; status?: string } = {}): Promise<AssessmentResponse[]> {
  const collected: AssessmentResponse[] = [];
  let page = 1;
  try {
    while (true) {
      const response = await assessmentService.list({ ...params, page, page_size: ASSESSMENTS_PAGE_SIZE });
      const items = response.items || [];
      collected.push(...items);
      const total = response.total ?? collected.length;
      if (items.length < ASSESSMENTS_PAGE_SIZE || collected.length >= total) break;
      page++;
      /* A server that ignores `page` would otherwise loop forever. The cap is
         far above any real tenant's assessment count. */
      if (page > 50) break;
    }
  } catch (error) {
    console.log('[TalentFlow] Failed to list assessments for', params, error);
  }
  return collected;
}

/** Newest assessment version first — the order every assessment table uses. */
const byAssessmentVersionDesc = (a: AssessmentResponse, b: AssessmentResponse) =>
  (b.version ?? 1) - (a.version ?? 1);

/**
 * The complete Job Opening → Job Version → Assessment structure for one job,
 * reachable from ANY of its JD rows.
 *
 * `jdId` may be any version of the job: the lineage is authoritative about the
 * others, and the requested row is always in scope even if the lineage does not
 * return it.
 */
export async function loadJobAssessmentHierarchy(jdId: string): Promise<JobAssessmentHierarchy> {
  let lineage: JDLineageVersion[] = [];
  let lineageResolved = true;
  try {
    lineage = await jdService.getLineageVersions(jdId);
  } catch (error) {
    /* Degraded to the one version we were asked about — never empty. The
       caller is told, so it can avoid claiming to show the whole job. */
    console.log('[TalentFlow] Failed to load JD lineage for the assessment hierarchy:', error);
    lineageResolved = false;
  }

  const jobVersionByJdId = new Map<string, number>();
  for (const version of lineage) {
    if (version?.id) jobVersionByJdId.set(version.id, version.version_number ?? 1);
  }

  const jdIds = [...new Set([jdId, ...lineage.map((v) => v.id).filter(Boolean)])];
  const jdIdSet = new Set(jdIds);

  const perVersion = await Promise.all(jdIds.map((versionId) => listAllAssessments({ jd_id: versionId })));

  /* Deduped by ASSESSMENT id — the record's own unique key, never by job,
     version number or title. Two assessments against one job version are two
     records and both survive, which is what lets a Draft and a Published
     assessment coexist on the same version. */
  const assessmentById = new Map<string, AssessmentResponse>();
  const jobVersionByAssessmentId = new Map<string, number>();

  perVersion.forEach((rows, index) => {
    const requestedId = jdIds[index];
    for (const row of rows) {
      if (!row?.id) continue;
      /* A row for a JD outside this job's lineage is another job's assessment,
         arriving because the filter was widened further than asked. Dropped —
         but only when the lineage actually answered, since with no lineage
         every sibling looks foreign and dropping them would lose the job. */
      if (lineageResolved && lineage.length > 0 && row.jd_id && !jdIdSet.has(row.jd_id)) continue;
      assessmentById.set(row.id, row);
      jobVersionByAssessmentId.set(
        row.id,
        jobVersionByJdId.get(row.jd_id ?? requestedId) ?? jobVersionByJdId.get(requestedId) ?? row.jd_version ?? 1,
      );
    }
  });

  const assessments = [...assessmentById.values()];

  /* Every version the JD has, plus any version an assessment resolves to that
     the lineage did not return. A version with no assessments is still a
     version of this job and belongs in the tree; an assessment pointing at a
     version the lineage no longer returns must not silently vanish. */
  const versionNumbers = [...new Set([
    ...lineage.map((v) => v.version_number ?? 1),
    ...jobVersionByAssessmentId.values(),
  ])].sort((a, b) => a - b);

  /* First lineage entry for a number wins: a republished JD can report several
     lineage rows sharing one version number, and those are one version. */
  const lineageByVersionNumber = new Map<number, JDLineageVersion>();
  for (const version of lineage) {
    const number = version.version_number ?? 1;
    if (!lineageByVersionNumber.has(number)) lineageByVersionNumber.set(number, version);
  }

  const versions: JobVersionAssessments[] = versionNumbers.map((versionNumber) => {
    const entry = lineageByVersionNumber.get(versionNumber);
    const own = assessments
      .filter((a) => jobVersionByAssessmentId.get(a.id) === versionNumber)
      .sort(byAssessmentVersionDesc);
    return {
      jdId: entry?.id ?? own[0]?.jd_id ?? jdId,
      versionNumber,
      title: entry?.title,
      status: entry?.status,
      isLatestVersion: entry?.is_latest_version,
      assessments: own,
    };
  });

  /* Nothing resolved at all — the job still has the version the caller arrived
     on, so the tree opens onto that rather than onto nothing. */
  if (versions.length === 0) {
    versions.push({
      jdId,
      versionNumber: jobVersionByJdId.get(jdId) ?? 1,
      assessments: [],
    });
  }

  return {
    requestedJdId: jdId,
    jdIds,
    lineage,
    versions,
    assessments,
    jobVersionByJdId,
    jobVersionByAssessmentId,
    lineageResolved,
  };
}

/**
 * JD row id → job version number, for a set of JD rows spanning MANY jobs.
 *
 * What the cross-job tabs need: their rows already name the assessment's
 * `jd_id`, and the only thing missing is which job version that row is. One
 * lineage request answers for every version of its job, so ids already resolved
 * by an earlier lookup are skipped rather than asked again — a job with five
 * versions costs one request, not five.
 *
 * Never throws. An id whose lineage could not be read is simply absent from the
 * map, and the caller falls back to whatever the record itself claims.
 */
export async function resolveJobVersionsByJdId(jdIds: (string | undefined | null)[]): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  const queue = [...new Set(jdIds.filter((id): id is string => !!id))];

  /* ONE request per VERSION_MAP_BATCH ids — `/jd/version-map` answers for every
     version of every job the ids belong to, so a page of jobs costs a request
     rather than one per job. A chunk is asked about only what an earlier chunk
     has not already answered. */
  for (let i = 0; i < queue.length; i += VERSION_MAP_BATCH) {
    const chunk = queue.slice(i, i + VERSION_MAP_BATCH).filter((id) => !resolved.has(id));
    if (chunk.length === 0) continue;
    try {
      const versions = await jdService.getVersionMap(chunk);
      for (const [id, versionNumber] of Object.entries(versions)) {
        resolved.set(id, versionNumber ?? 1);
      }
    } catch {
      /* The batched answer is unavailable (an older backend, a transient
         failure) — fall back to one lineage request per job for this chunk,
         which is what this function did before the batch existed. */
      await resolveViaLineage(chunk, resolved);
    }
  }

  return resolved;
}

/**
 * The pre-batch path: one `/jd/{id}/lineage` request per job, a few at a time.
 * Kept as the fallback for `resolveJobVersionsByJdId`. Never throws — an id
 * whose lineage could not be read is simply absent from `resolved`.
 */
async function resolveViaLineage(ids: string[], resolved: Map<string, number>): Promise<void> {
  /* Asked-for ids that a lineage answered for, so a later chunk does not ask
     again for something already known. */
  const asked = new Set<string>();

  for (let i = 0; i < ids.length; i += LINEAGE_LOOKUP_CONCURRENCY) {
    const chunk = ids.slice(i, i + LINEAGE_LOOKUP_CONCURRENCY).filter((id) => !resolved.has(id) && !asked.has(id));
    if (chunk.length === 0) continue;
    for (const id of chunk) asked.add(id);
    const lineages = await Promise.all(
      chunk.map(async (id) => {
        try {
          return await jdService.getLineageVersions(id);
        } catch {
          /* This job's version numbers stay unknown; every other job still
             resolves. */
          return [] as JDLineageVersion[];
        }
      }),
    );
    for (const lineage of lineages) {
      for (const version of lineage) {
        if (version?.id) resolved.set(version.id, version.version_number ?? 1);
      }
    }
  }
}

/**
 * The job version an assessment belongs to — id first, the record's own
 * `jd_version` snapshot only as the fallback.
 *
 * The one place this precedence is written down for callers that hold a
 * resolved map and a row, rather than a whole hierarchy.
 */
export function jobVersionOfAssessment(
  assessment: { jd_id?: string; jd_version?: number } | null | undefined,
  jobVersionByJdId: Map<string, number>,
): number | undefined {
  if (!assessment) return undefined;
  const byId = assessment.jd_id ? jobVersionByJdId.get(assessment.jd_id) : undefined;
  if (byId !== undefined) return byId;
  return typeof assessment.jd_version === 'number' ? assessment.jd_version : undefined;
}
