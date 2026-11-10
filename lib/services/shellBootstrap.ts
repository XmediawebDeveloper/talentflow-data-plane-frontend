'use client';

import api, { getTokens } from './api';

/**
 * App-shell bootstrap: ONE `GET /bootstrap` replaces the five reads every hard
 * load of the dashboard fired from separate providers:
 *
 *   admin_assigned_plan   (AdminAssignedPlanProvider)  /subscription/admin-assigned-plan
 *   pending_plan_changes  (PlanChangeProvider)         /plan-changes/pending
 *   quota_status          (QuotaContext)               /usage/quota-status
 *   user_settings         (SessionTimeoutProvider)     /user-settings
 *   experience_levels     (dashboard layout)           /master-data/experience-levels?include_inactive=true
 *
 * Each provider calls `takeBootstrapPart(name)` for its FIRST load only:
 *  - hit  -> the exact body that endpoint would have returned;
 *  - miss -> (no token, /bootstrap failed or missing on an older backend, the
 *    part itself errored, already taken, or the response is stale) the
 *    provider makes its own call exactly as before, so error handling and
 *    interceptor events are unchanged.
 * Later refreshes / polls always go to the provider's own endpoint.
 *
 * Memory only, one request per access token per page load — nothing is
 * persisted, and a different token (other tenant / subdomain / re-login) never
 * sees another token's response. `/auth/me` is not part of it.
 */

export type ShellBootstrapPartName =
  | 'admin_assigned_plan'
  | 'pending_plan_changes'
  | 'quota_status'
  | 'user_settings'
  | 'experience_levels';

interface BootstrapPart {
  status: number;
  data?: unknown;
  detail?: unknown;
}

/** A response older than this is not handed out (a provider mounting later re-reads). */
const MAX_AGE_MS = 20_000;

let current: {
  token: string;
  startedAt: number;
  promise: Promise<Record<string, BootstrapPart> | null>;
  taken: Set<string>;
} | null = null;

function load(token: string) {
  if (current && current.token === token) return current;
  const promise = api
    .get<{ parts?: Record<string, BootstrapPart> }>('/bootstrap', { dedupe: false, timeout: 20000 })
    .then((res) => (res.data && typeof res.data.parts === 'object' ? res.data.parts : null))
    .catch(() => null);
  current = { token, startedAt: Date.now(), promise, taken: new Set() };
  return current;
}

export async function takeBootstrapPart<T = unknown>(
  name: ShellBootstrapPartName,
): Promise<{ hit: true; data: T } | { hit: false }> {
  let token: string | null = null;
  try {
    token = getTokens().accessToken ?? null;
  } catch {
    token = null;
  }
  if (!token) return { hit: false };
  const entry = load(token);
  if (entry.taken.has(name)) return { hit: false };
  entry.taken.add(name);
  const parts = await entry.promise;
  if (!parts || Date.now() - entry.startedAt > MAX_AGE_MS) return { hit: false };
  // The token changed while we waited (logout / re-login): don't hand it out.
  if (current !== entry) return { hit: false };
  const part = parts[name];
  if (!part || part.status !== 200) return { hit: false };
  return { hit: true, data: part.data as T };
}
