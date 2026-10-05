'use client';

/**
 * "Opened from a resume" breadcrumb trail.
 *
 * The Resume View page's Candidate Activity card links into four other
 * modules' pages: a scoring detail, an AI Talent Match result, an assessment
 * result and an AI interview result. Each of those pages builds its own
 * module trail (Dashboard › Resume Scoring › <job> …), so on arrival the
 * recruiter lost the way back to the resume they were reading.
 *
 * The card now records the resume's own trail before it navigates:
 *   Dashboard › Resume Database › My Resumes › <candidate>
 * (whatever the resume page itself was showing), and tags the link with
 * `from=resume-view`. A destination page that sees the tag shows that trail
 * plus its own last crumb, and its Back goes to the resume.
 *
 * The trail lives in sessionStorage (one tab), not the URL. The tag is what
 * activates it, so a page opened any other way never picks up a stale trail.
 */

import { useEffect, useState } from 'react';

export const FROM_RESUME_VIEW = 'resume-view';
const STORAGE_KEY = 'resumeActivityTrail';

export interface TrailCrumb {
  label: string;
  href: string;
}

/** `&from=resume-view`, ready to append to a destination URL. */
export const resumeViewFromQuery = `&from=${FROM_RESUME_VIEW}`;

/** Saved by the Candidate Activity card just before it navigates. The last
 *  crumb is the resume itself, so it is also where Back goes. */
export function rememberResumeActivityTrail(trail: TrailCrumb[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trail));
  } catch { /* storage blocked: the destination keeps its own trail */ }
}

function readTrail(): TrailCrumb[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    // In-app recruitment paths only, so the stored value cannot point
    // anywhere else.
    const ok = parsed.every(
      (c: any) => c && typeof c.label === 'string' && typeof c.href === 'string'
        && c.href.startsWith('/recruitment/') && !c.href.startsWith('//') && !c.href.includes('://')
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The resume trail when this page was opened from Candidate Activity, else
 * null. `fromResumeView` is known from the URL straight away, before the
 * trail is read, so a page can hide its own module crumbs and its Prev/Next
 * (which would step through some other list) from the first render.
 */
export function useResumeActivityTrail(searchParams: { get: (key: string) => string | null } | null) {
  const fromResumeView = searchParams?.get('from') === FROM_RESUME_VIEW;
  const [trail, setTrail] = useState<TrailCrumb[] | null>(null);
  useEffect(() => {
    setTrail(fromResumeView ? readTrail() : null);
  }, [fromResumeView]);
  const active = fromResumeView && !!trail;
  return {
    /** Tagged AND a trail was found: use it. */
    active,
    /** Tagged: hide module-only controls even before the trail is read. */
    fromResumeView,
    /** Dashboard + the resume's crumbs, ready to prefix the page's own leaf. */
    items: active ? [{ label: 'Dashboard', href: '/dashboard' }, ...trail!] : [],
    /** The resume page — where Back goes. */
    backHref: active ? trail![trail!.length - 1].href : null,
  };
}
