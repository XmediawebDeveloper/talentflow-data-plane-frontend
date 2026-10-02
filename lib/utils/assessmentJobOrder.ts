/**
 * THE TOTAL JOBS ORDER — one row per job, in the order the Assessments page's
 * Total Jobs list draws them.
 *
 * Moved here verbatim from `components/Assessments.tsx` so that list and the
 * assessment details page's Prev / Next pager read ONE ordering rather than
 * two. They used to differ - the pager kept the raw API order and picked each
 * job's newest assessment even when that was a draft on top of a published
 * version - so the details page said "2 / 71" for the job Total Jobs lists
 * first. Change the order here and both follow.
 *
 * Accepts rows in either status form: the Assessments page's display status
 * ('Draft', 'Active', ...) or the API's raw one ('draft', 'published', ...).
 */

export interface JobOrderRow {
  id: string;
  jd_short_id?: string;
  jd_id?: string;
  status?: string;
  jd_version?: number;
  version?: number;
  created_at?: string;
  published_at?: string;
  updated_at?: string;
}

const isDraftStatus = (status?: string) => String(status ?? '').toLowerCase() === 'draft';
const isActiveStatus = (status?: string) => {
  const s = String(status ?? '').toLowerCase();
  return s === 'active' || s === 'published';
};

/* `jd_short_id` ("JD-014") is the key every version of a job shares: it is
   `Job.job_id` under the name the assessment endpoint gives it (see
   `mapJDToJob` and `lineageKey` in lib/utils/jobOpeningDisplay.ts). `jd_id` is
   NOT that field — it identifies the single JD version an assessment was built
   against, which is the thing a job's versions differ by, not the thing they
   collapse on. A row with neither falls back to its own id, so it stays a job
   of one rather than piling into a shared "no job" bucket where unrelated rows
   would look like versions of one another. */
export const jobLineageKey = (a: { jd_short_id?: string; jd_id?: string; id: string }) =>
  a.jd_short_id || a.jd_id || `__unlinked__:${a.id}`;

/**
 * One row per ASSESSMENT, not one per version.
 *
 * An assessment duplicated to V2 and V3 used to put three cards on the page,
 * repeating the same job title, each with its own vN badge and nothing
 * saying they were the same assessment. Only the latest version is listed
 * now; the rest live behind that card's View Versions button.
 *
 * An assessment's versions are the other assessments sharing its JD — that
 * is what the version cap counts and what the details view's own
 * "New Versions" tab fetches, so it is the app's existing definition rather
 * than a new one. Rows with no JD are their own lineage: unrelated
 * assessments must not collapse into each other just because they share a
 * missing field.
 *
 * "Sharing its JD" means the JOB, not one version of it. Every republish
 * mints a new JD row with its own `jd_id` under the same human-readable
 * `jd_short_id` (JD-025), so keying on `jd_id` put one card on the page per
 * job VERSION — three rows all badged JD-025, which is the duplication a
 * recruiter sees. `jd_short_id` is what the versions of a job share, and it
 * is the same key the Job Openings list collapses on (`lineageKey` in
 * lib/utils/jobOpeningDisplay), so one Job ID means one row here too. The
 * versions behind it are what View Versions opens.
 *
 * Order is by each lineage's FIRST appearance in the server's ordering, so
 * collapsing does not reshuffle a list the user was already reading.
 *
 * Note this runs on the tab-filtered set: on the Draft tab a lineage whose
 * V3 alone is a draft is represented by V3, which is the right answer for
 * "the draft assessments" — and the version panel fetches the lineage
 * unfiltered, so opening it still shows every version whatever its status.
 */
export function collapseByLineage<T extends JobOrderRow>(list: T[]): T[] {
  const byLineage = new Map<string, T>();

  /* Which of two rows of one lineage is the newer VERSION — the Job Openings
     list's `byLatestVersion`, read against the pair of numbers an assessment
     carries. Negative when `a` is newer, so it reads like a sort comparator.

     Newest JOB version wins, and only then the newest assessment version
     within it. The job is the parent, so "which row represents this job" is
     answered by the job's own version first - picking on the assessment
     number alone could put an older job version on the card whenever an
     assessment was duplicated after a republish.

     DRAFT IS THE ONE STATUS TERM, and it outranks nothing: a version that
     is still a draft never represents a lineage that has a non-draft
     version in it. This is what keeps the Main Assessment List still when
     a version is duplicated. Duplicate mints the next version as a Draft,
     and on a pure sequence rule that draft immediately became the row —
     so an Active assessment turned Draft, its name grew a "- Version 2"
     suffix, its stage moved and the open version panel (keyed on the old
     row's id) closed itself, all from an action that was supposed to touch
     only the versions table. None of that was a data change; the list was
     simply pointing at a different member of the same lineage.

     Only DRAFT is weighed, not a full status ranking: Active vs Completed
     vs Archived still sort purely by version, exactly as before, so the
     only lineage whose row moves is one that had a draft on top of a
     non-draft. A lineage that is all drafts still shows its newest draft —
     there is no non-draft version for it to be represented by.

     `created_at` is the last tie-break, for the same reason it is one there:
     when the list endpoint omits `version` every row falls back to 1, both
     numeric comparisons tie, and "latest" would quietly become whatever order
     the API happened to return — enough to flip a lineage's card between its
     draft and its published version from one load to the next. */
  const isNewerVersion = (a: T, b: T) => {
    /* A draft loses to any non-draft in the same lineage, whatever the
       version numbers say. Checked before the job version too: a draft
       authored against a newer JOB version is still a draft, and letting
       it through here would flip the row on the next republish-and-
       duplicate just as surely. */
    const aIsDraft = isDraftStatus(a.status);
    const bIsDraft = isDraftStatus(b.status);
    if (aIsDraft !== bIsDraft) return !aIsDraft;
    const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
    if (jobDelta !== 0) return jobDelta > 0;
    const versionDelta = (a.version ?? 1) - (b.version ?? 1);
    if (versionDelta !== 0) return versionDelta > 0;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime > bTime;
  };

  for (const assessment of list) {
    const key = jobLineageKey(assessment);
    const current = byLineage.get(key);
    if (!current || isNewerVersion(assessment, current)) {
      byLineage.set(key, assessment);
    }
  }
  return [...byLineage.values()];
}

/* Total Jobs order: the job whose assessment was published most recently
   first. Each job (lineage) is ranked by the latest publish among ALL of its
   assessments in the list — so publishing the assessment of any job
   version, V1 or V3, lifts that job to the top — and the row that represents
   it is still the one `collapseByLineage` picks. The time is the API's
   `published_at`; a published (Active) assessment the API returned without
   one falls back to its `updated_at`, the moment its status last changed.
   Jobs with nothing published keep their existing relative order below
   (the sort is stable), so nothing else in the list reshuffles. The list
   reloads after every publish, so the order follows on its own. */
const publishTimeOf = (assessment: JobOrderRow) => {
  const stamp = assessment.published_at
    || (isActiveStatus(assessment.status) ? assessment.updated_at : undefined);
  const time = stamp ? new Date(stamp).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

/** The Total Jobs rows for `list`: collapsed per job, latest publish first. */
export function orderTotalJobs<T extends JobOrderRow>(list: T[]): T[] {
  const latestPublishByLineage = new Map<string, number>();
  for (const assessment of list) {
    const key = jobLineageKey(assessment);
    const time = publishTimeOf(assessment);
    if (time > (latestPublishByLineage.get(key) ?? 0)) latestPublishByLineage.set(key, time);
  }
  return collapseByLineage(list).sort((a, b) =>
    (latestPublishByLineage.get(jobLineageKey(b)) ?? 0) - (latestPublishByLineage.get(jobLineageKey(a)) ?? 0),
  );
}
