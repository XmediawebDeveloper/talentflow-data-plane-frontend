/**
 * Job-opening display logic, shared by every surface that lists JDs.
 *
 * The Job Openings page is the reference listing. Anything else that shows the
 * same jobs — the Apply to Job / Score Resume dialog most of all — imports from
 * here rather than re-deriving a label or a badge colour, so a change to how a
 * job reads on that page reaches the other surfaces with it.
 *
 * Everything in this module is pure: formatting, badge tokens, the API → Job
 * mapping, lineage collapsing and the list sort. No fetching, no React.
 */

import type { Job } from '@/lib/types/types';
import type { JDResponse, JDLineageVersion } from '@/lib/services/jdService';
import { formatISTDate, parseIST } from '@/lib/utils/dateUtils';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';

/** "full_time" → "Full Time". A dash when there is nothing to format. */
export const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '-';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/** "information_technology" → "Information Technology". */
export const formatIndustryType = (type: string | undefined): string => {
  if (!type) return '-';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Within 24 hours: "31 mins ago" / "3 hours ago". Older than that: the date.
 * Server times are UTC, so they go through the IST parser first.
 */
export const formatLastUpdated = (dateString: string | undefined): string => {
  if (!dateString) return '-';

  const istDate = parseIST(dateString);
  const now = new Date();

  const diffInSeconds = Math.floor((now.getTime() - istDate.getTime()) / 1000);
  const diffInHours = Math.floor(diffInSeconds / 3600);

  if (diffInHours >= 0 && diffInHours < 24) {
    if (diffInHours === 0) {
      const minutes = Math.floor(diffInSeconds / 60);
      if (minutes < 1) return 'Just now';
      return `${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`;
    }
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  return formatISTDate(dateString);
};

/**
 * Display status — a published JD on its 2nd publish or later reads
 * "Republished". Driven by `current_version`, the JD's publish counter.
 */
export const getDisplayStatus = (status: string, currentVersion?: number): string => {
  if (status === 'Published' && currentVersion && currentVersion > 1) {
    return 'Republished';
  }
  return status;
};

/**
 * Does ONE JD version satisfy a status pill?
 *
 * Evaluated per version, and the list keeps a job when any of its versions says
 * yes — so a job appears under Draft because some version is a draft, even when
 * its latest version is published, and vice versa. Section-by-section:
 *
 *   Published → Published OR Republished
 *   Draft     → Draft only
 *   Disabled  → Disabled only
 *   Archived  → Archived only
 *
 * Published is the only combined condition. "Republished" is not a stored
 * status — `getDisplayStatus` derives it from the publish counter over a status
 * that is already `Published` — so the raw test covers it on its own. The
 * display status is compared as well rather than relying on that: if
 * "Republished" ever becomes a status in its own right, this keeps answering
 * correctly instead of quietly dropping those versions out of the Published
 * pill.
 *
 * 'all' is not this function's business — the caller short-circuits it, so the
 * All Jobs filter keeps its own untouched behaviour.
 */
export const matchesStatusFilter = (job: Job, statusFilter: string): boolean => {
  const pill = statusFilter.toLowerCase();
  if (pill === 'all') return true;

  const rawStatus = (job.status || '').toLowerCase();
  const displayStatus = getDisplayStatus(job.status, job.currentVersion).toLowerCase();

  if (pill === 'published') {
    return rawStatus === 'published' || displayStatus === 'published' || displayStatus === 'republished';
  }

  /* Exact match for Draft, Disabled and Archived — no status is folded into
     another. getDisplayStatus leaves all three untouched, so the two tests
     agree; the display one is kept only for symmetry with the branch above. */
  return rawStatus === pill || displayStatus === pill;
};

export interface BadgeTokens {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export const getStatusConfig = (status: string): BadgeTokens => {
  switch (status) {
    case 'Published':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' };
    case 'Republished':
      return { bg: 'bg-brand-blue/10', text: 'text-brand-blue', border: 'border-brand-blue/20', dot: 'bg-brand-blue' };
    case 'Draft':
      return { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', border: 'border-brand-orange/20', dot: 'bg-brand-orange' };
    case 'Closed':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
    case 'Disabled':
      return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', dot: 'bg-red-500' };
    case 'Archived':
      return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', dot: 'bg-gray-400' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-500' };
  }
};

export const getCreationMethodConfig = (method: string | undefined): BadgeTokens & { label: string } => {
  if (method === 'ai_generated') {
    return {
      bg: 'bg-brand-blue-2/10',
      text: 'text-brand-blue-2',
      border: 'border-brand-blue-2/20',
      dot: 'bg-brand-blue-2',
      label: 'AI',
    };
  }
  return {
    bg: 'bg-brand-cyan/10',
    text: 'text-brand-cyan',
    border: 'border-brand-cyan/20',
    dot: 'bg-brand-cyan',
    label: 'Manual',
  };
};

export const calculateDaysActive = (createdAt: string | undefined): number => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const now = new Date();
  return Math.ceil(Math.abs(now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
};

export const mapJDStatus = (status: string): Job['status'] => {
  const statusMap: Record<string, Job['status']> = {
    published: 'Published',
    active: 'Published',
    draft: 'Draft',
    closed: 'Closed',
    archived: 'Archived',
    disabled: 'Disabled',
  };
  return statusMap[status?.toLowerCase()] || 'Draft';
};

/**
 * One JD row as the list endpoints return it. JDResponse plus the few fields
 * the API sends that its type does not declare — the lineage version above
 * all, which is what the vN badge reads.
 */
export type JDListRow = JDResponse & {
  version_number?: number;
  required_match?: number;
  skills?: string[];
};

/**
 * One API JD row → the `Job` the listing renders.
 *
 * This is the Job Openings page's own mapping, lifted here so the Apply to Job
 * dialog builds its rows from exactly the same fields. Every host used to keep
 * its own partial copy, and the fields each one forgot (publish count, lineage
 * version, experience) were precisely the ones missing from its list.
 */
export const mapJDToJob = (jd: JDListRow): Job => ({
  id: jd.id,
  job_id: jd.job_id, // Human-readable ID like JD-001
  title: jd.title || 'Untitled',
  status: mapJDStatus(jd.status),
  location: jd.location || (jd.locations || []).map((loc) => loc?.city).filter(Boolean).join(', ') || '',
  daysActive: calculateDaysActive(jd.created_at),
  requiredMatch: jd.required_match || 70,
  department: jd.department,
  industry_type: jd.industry_type,
  experience: formatJobExperienceText({
    jobLevel: jd.job_level || jd.experience_level,
    experienceMin: jd.experience_min,
    experienceMax: jd.experience_max,
  }),
  experience_min: jd.experience_min,
  experience_max: jd.experience_max,
  applicants: jd.applicants_count || 0,
  description: jd.description,
  skills: jd.skills || jd.must_have_skills || [],
  postedDate: jd.created_at,
  postedBy: jd.created_by_name || jd.created_by,
  employmentType: jd.employment_type,
  workMode: jd.remote_type, // onsite, hybrid, remote
  created_at: jd.created_at, // For accurate sorting
  updated_at: jd.updated_at, // For last updated display
  creation_stage: jd.creation_stage, // For draft JDs
  creation_method: jd.creation_method, // AI or Manual
  currentVersion: jd.current_version, // publish count → drives the "Republished" label
  versionNumber: jd.version_number ?? 1, // lineage version → v1/v2 badge (same JD-ID)
  experience_level: jd.job_level || jd.experience_level,
});

/**
 * Lineage key — what the versions of one job share. Rows without a job_id
 * (drafts that never got one) fall back to their own id and stay individual.
 */
export const lineageKey = (job: Job): string => job.job_id || job.id;

/**
 * Newest version of a lineage first: highest `version_number`, then most
 * recently created.
 *
 * The date is the tie-break, not decoration. When the list endpoint omits
 * `version_number` every row in the lineage falls back to 1, the numeric
 * comparison ties, and "latest" would quietly become whatever order the API
 * happened to return — enough to flip a job's representative between a draft
 * and a published version from one load to the next, and with it the published
 * count derived below.
 */
const byLatestVersion = (a: Job, b: Job): number => {
  const versionDelta = (b.versionNumber ?? 1) - (a.versionNumber ?? 1);
  if (versionDelta !== 0) return versionDelta;
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  return bTime - aTime;
};

/**
 * Group rows by lineage, newest version first inside each bucket, so `[0]` is
 * the row that represents the job. "Newest" is read from the data (see
 * `byLatestVersion`), never assumed to be first or last in the response.
 */
export const groupByLineage = (list: Job[]): Map<string, Job[]> => {
  const groups = new Map<string, Job[]>();
  for (const job of list) {
    const key = lineageKey(job);
    const bucket = groups.get(key);
    if (bucket) bucket.push(job);
    else groups.set(key, [job]);
  }
  groups.forEach(bucket => bucket.sort(byLatestVersion));
  return groups;
};

/** One row per job — the lineage representative of each group. */
export const collapseToLatestVersions = (list: Job[]): Job[] =>
  Array.from(groupByLineage(list).values(), bucket => bucket[0]);

/**
 * The published jobs in a list of JD versions — THE definition, used by the
 * Job Openings page's Published stat card and by the Apply to Job dialog's
 * "N available" line and its selectable list.
 *
 * A job counts as published when the LATEST version of its lineage is
 * published. Not "has a published version somewhere": a job whose v3 is a
 * draft over a published v2 is being re-drafted, and the page treats it as a
 * draft. That distinction is the whole reason the two places disagreed — the
 * dialog used to ask the API for `status: 'published'`, which stripped the v3
 * before the lineage could be collapsed, so the v2 stood in as the latest and
 * the job was counted here but not there.
 *
 * Therefore: pass the FULL, unfiltered version list. Filtering by status
 * upstream of this call makes it answer the other question.
 */
export const getPublishedJobs = (allVersions: Job[]): Job[] =>
  collapseToLatestVersions(allVersions).filter(job => job.status === 'Published');

/* ── Create Assessment: visibility vs selection ────────────────────────────
   The assessment picker answers TWO questions about a JD version, and they are
   deliberately different questions with different answers. Conflating them is
   the bug this section exists to prevent, in both directions: a status filter
   written once hides versions a recruiter needs to see, and a visibility test
   reused as a selection test offers picks the next step refuses.

     MAIN LIST   — which ONE version of a job represents it in the picker?
                   Its latest LIVE version: the highest-numbered Published or
                   Republished one. A newer Archived, Disabled or Draft version
                   does not take that place — the job is still live at the
                   version below it, and that is the version an assessment
                   would be built against. A job with no live version at all
                   therefore has no row.

     VERSION HISTORY — which versions are listed under it?
                   All of them, newest first, each showing its real status:
                   Published, Republished, Disabled, Archived and Draft alike.
                   This is where a recruiter reads what happened to a job.

     SELECTION   — can a NEW assessment be created against a version?
                   Published and Republished only. Disabled and Archived are
                   out of service, so an assessment authored against one would
                   be pinned to a JD no candidate will ever be sent, and a
                   Draft is unfinished.

   Whether the version already HAS an assessment is a further, separate thing:
   it is a reason the existing record must be preserved and surfaced, never a
   reason to change any answer above. An archived version with an assessment is
   listed in that job's version history showing "Archived", and is not
   selectable — its assessment does not buy it selectability, and its archived
   status does not remove the assessment already built against it. */

/**
 * Can a NEW assessment be created against this JD version? Published and
 * Republished only.
 *
 * An allowlist rather than a list of excluded statuses, so a status this app
 * has never heard of can only ever be treated as not selectable.
 *
 * Republished needs care in BOTH directions. It is not a stored status: the
 * record's own status is `published`, and `getDisplayStatus` derives the label
 * from a publish counter that has passed 1. So the `published` test already
 * covers every republished version, and the literal is accepted as well — that
 * way a republished version can never be mistaken for an unselectable one just
 * because its label was compared instead of its status.
 */
export const isSelectableVersion = (job: Pick<Job, 'status'>): boolean => {
  const status = String(job.status || '').toLowerCase();
  return status === 'published' || status === 'republished';
};

/**
 * The version of a lineage that represents it in the Create Assessment main
 * list — its latest LIVE version, or `null` when it has none.
 *
 * Live means Published or Republished, which is deliberately the same test the
 * radio uses (`isSelectableVersion`): the row a recruiter sees in this list is
 * always a row they can actually build an assessment against.
 *
 * `bucket` arrives newest-version-first (see `groupByLineage`), so the first
 * live entry is the latest one and no sort is repeated here.
 *
 * Latest LIVE rather than highest-numbered is what stops a version that is no
 * longer in service from standing in for a job that is: v3 archived over a
 * published v2 leaves the card reading "v2 · Published", because v2 is where
 * the job is still live and v2 is what an assessment would be built against.
 * The same skip covers a v4 draft raised over a published v3. Republished
 * needs no special case — its stored status is `published`.
 *
 * The skipped versions are not lost: View Versions lists the entire lineage,
 * newest first, each row showing its real status.
 *
 * `null` (rather than `bucket[0]`) removes a job with no live version at all —
 * one that is nothing but drafts, or whose every version has been archived or
 * disabled. There is no version of it an assessment could be built against, so
 * there is no row.
 */
export const assessmentListRepresentative = (bucket: Job[]): Job | null =>
  bucket.find(version => isSelectableVersion(version)) ?? null;

/**
 * The Create Assessment job list: one row per job, each on its latest live
 * (Published or Republished) version, with jobs that have no live version
 * dropped.
 *
 * Pass the FULL, unfiltered version list. The status test runs per version
 * INSIDE each lineage, so filtering by status upstream would remove the very
 * versions the collapse needs in order to pick the right representative.
 *
 * Takes no account of assessments, by design — see the note above. Visibility
 * here is a pure function of status.
 */
export const buildAssessmentJobList = (allVersions: Job[]): Job[] => {
  const reps: Job[] = [];
  groupByLineage(allVersions).forEach(bucket => {
    const rep = assessmentListRepresentative(bucket);
    if (rep) reps.push(rep);
  });
  return reps;
};

export type JobSortBy = 'date' | 'applicants' | 'title' | 'status' | 'industry';
export type JobSortOrder = 'asc' | 'desc';

/** The listing's sort. 'desc' inverts the natural order (newest/largest first). */
export const sortJobs = (list: Job[], sortBy: JobSortBy, sortOrder: JobSortOrder): Job[] =>
  [...list].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date': {
        // created_at if available, falling back to postedDate.
        const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.postedDate ? new Date(a.postedDate).getTime() : 0);
        const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.postedDate ? new Date(b.postedDate).getTime() : 0);
        comparison = dateA - dateB; // ascending; 'desc' flips it to newest first
        break;
      }
      case 'applicants':
        comparison = (a.applicants || 0) - (b.applicants || 0);
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'industry': {
        // Case-insensitive, with jobs that have no industry always last.
        const indA = (a.industry_type || '').trim().toLowerCase();
        const indB = (b.industry_type || '').trim().toLowerCase();
        if (!indA && indB) return 1;
        if (indA && !indB) return -1;
        if (!indA && !indB) return 0;
        comparison = indA.localeCompare(indB);
        break;
      }
      default:
        comparison = 0;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

/**
 * The live version NUMBER of a lineage — the single answer every "Latest"
 * badge is checked against, so the Job Openings list, the Assessments list and
 * both version-history tables mark the same version as latest.
 *
 * Read from the lineage rather than assumed: a version is latest because it is
 * the highest one the data carries, never because it came first in a response
 * or because nothing contradicted it. `fallback` is what the caller already
 * knows (typically the row's own version), so a lineage that has not loaded
 * yet degrades to "the newest version known here" instead of to 1.
 *
 * SEQUENCE, not status, and not `is_latest_version`. A v2 draft sitting over a
 * published v1 is the latest version — the job is being re-drafted, which is
 * the same reading `getPublishedJobs` below takes of it. And the flag can only
 * ever agree with the number here: it names a row that is already in this list,
 * so honouring it separately could only ever LOWER the answer, putting the
 * badge (and the card the badge sits on) on a superseded version.
 */
export const latestVersionNumber = (
  versions: Pick<JDLineageVersion, 'version_number'>[] | undefined,
  fallback = 1,
): number =>
  (versions ?? []).reduce((highest, v) => Math.max(highest, v.version_number ?? 1), fallback);

/**
 * The job-list search, as one implementation: the Apply to Job dialog's and
 * the assessment JD picker's "Search Jobs" field both narrow their list
 * through this, so a query that finds a job in one finds it in the other.
 *
 * Matching only the title meant a JD number typed in full returned nothing —
 * the number lives on `job_id`, and departments and locations are searched for
 * just as often.
 *
 * Two passes per field. The plain one is a straight substring, so "77" finds
 * JD-77 and "develop" finds Developer. The second strips everything that isn't
 * a letter or a digit from BOTH sides first, so the separator a recruiter
 * types doesn't have to match the one the record was stored with: "jd-77",
 * "JD 77", "jd_77" and "jd77" all find the same job.
 *
 * Returns a predicate rather than taking the query per row: the normalising
 * happens once for the whole list, not once per job.
 */
export const jobSearchMatcher = (query: string): ((job: Job) => boolean) => {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const plain = query.trim().toLowerCase();
  const compact = normalize(query);

  return (job: Job) => {
    if (!plain) return true;
    // Hosts hand in rows carrying the JD number under several names.
    const j = job as Job & Record<string, unknown>;
    return [
      job.title,
      j.job_id,
      j.jobId,
      j.jd_number,
      j.jd_id,
      j.reference_id,
      j.industry_type,
      j.department,
      job.location,
      j.employment_type,
      j.employmentType,
    ]
      .filter(Boolean)
      .some(field => {
        const raw = String(field).toLowerCase();
        if (raw.includes(plain)) return true;
        // Guard against a punctuation-only query matching everything.
        return !!compact && normalize(String(field)).includes(compact);
      });
  };
};

/**
 * Whether ONE version belongs in a `publishedOnly`-filtered Resume Scoring
 * history: never a draft; an archived or disabled version only if it was
 * actually scored (missing/zero count reads as "never scored" — nothing
 * invented). Published and any other status pass through unconditionally.
 *
 * Shared by `resolveVersionHistoryRows` below (JDLineageVersion rows, the
 * table/cards' own data) and `JobOpeningPickerList`'s "does this lineage have
 * anything worth a View Versions button" check, which counts from its
 * already-fetched Job-shaped siblings rather than a fresh lineage fetch — two
 * different input shapes needing the identical rule so the button's guess
 * never drifts from what the table it opens actually shows.
 */
export const isVersionVisibleForScoring = (
  status: string | undefined,
  versionId: string,
  versionApplicants: Record<string, number> | undefined,
): boolean => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'draft') return false;
  if (normalized === 'archived' || normalized === 'disabled') {
    return (versionApplicants?.[versionId] ?? 0) > 0;
  }
  return true;
};

export interface ResolvedVersionRow extends JDLineageVersion {
  /** The live version of the lineage — the flag is preferred, the version
   *  number backstops a lineage row that omits it. */
  isLatest: boolean;
}

/**
 * The version rows one job's "View Versions" history renders, resolved once so
 * the table (JobVersionHistoryPanel) and the compact cards
 * (JobVersionHistoryCards) always show the identical chain instead of two
 * hand-rolled copies drifting apart.
 *
 * Deduplicated by version NUMBER: a republished JD can report several lineage
 * entries sharing one version number (republishing bumps `current_version`,
 * not the lineage version), and those are one version, not several. Sorted
 * newest-first, so a chain always opens on the live version.
 */
export const resolveVersionHistoryRows = (
  job: Pick<Job, 'id' | 'versionNumber'>,
  versions: JDLineageVersion[] | undefined,
  options?: {
    excludeId?: string;
    publishedOnly?: boolean;
    /**
     * Resumes scored per version id — only consulted under `publishedOnly`,
     * to decide whether an ARCHIVED or DISABLED version is worth listing. A
     * version a recruiter archived or disabled without ever scoring anyone
     * against it has nothing for Resume Scoring's history to show; one that
     * was scored before being archived/disabled is exactly the past activity
     * that history exists to surface. Missing or zero counts as "no
     * candidates" — never invented, since an uncounted version reads the
     * same as a genuinely empty one here.
     */
    versionApplicants?: Record<string, number>;
  },
): ResolvedVersionRow[] => {
  const lineageVersions = versions ?? [];
  const latestNumber = latestVersionNumber(lineageVersions, job.versionNumber ?? 1);

  const seenVersionNumbers = new Set<number>();
  return lineageVersions
    .filter((v) => {
      const number = v.version_number ?? 1;
      if (seenVersionNumbers.has(number)) return false;
      seenVersionNumbers.add(number);
      /* Selection surfaces (Apply to Job dialog) show a radio for the row
         above this history that duplicates its own version — excluded only
         there, via excludeId, so a read-only table isn't missing a row. */
      if (options?.excludeId && v.id === options.excludeId) return false;
      /* Resume Scoring's history is about what a candidate can be scored
         against, so a still-drafted version — never live, nothing to score —
         and an archived/disabled one nobody ever scored are both noise
         there. Gated behind an option rather than applied everywhere: Job
         Openings' own history is a job's full edit trail, where a draft in
         progress is exactly what a recruiter expects to see. */
      if (options?.publishedOnly && !isVersionVisibleForScoring(v.status, v.id, options.versionApplicants)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1))
    .map((v) => ({
      ...v,
      isLatest: v.is_latest_version || (v.version_number ?? 1) >= latestNumber,
    }));
};
