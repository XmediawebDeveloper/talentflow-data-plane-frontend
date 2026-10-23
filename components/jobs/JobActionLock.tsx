'use client';

import { createContext, useContext } from 'react';

/**
 * Why the job a page is showing takes no new work — "JD is disabled" /
 * "JD is archived" — or null. Job Details provides it around its tabs, so
 * every table inside (AI Talent Match, Scored Resumes, Assessment and AI
 * Interview results) greys out Create / Send Assessment, Create / Send AI
 * Interview and Score — row menus and the Select All › Actions menu alike —
 * with this as the reason. Pages without a provider are unaffected.
 */
const JobActionLockContext = createContext<string | null>(null);

export const JobActionLockProvider = JobActionLockContext.Provider;

export function useJobActionLock(): string | null {
  return useContext(JobActionLockContext);
}
