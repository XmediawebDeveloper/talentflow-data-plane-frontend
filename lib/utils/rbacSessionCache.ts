import { getTokens } from '@/lib/services/api';

/**
 * In-memory (module-level) cache for RBAC reads that the Users and Roles pages
 * repeat on every visit: the permission catalogue and each role's shown
 * permission count.
 *
 * Safety:
 *  - Scoped to the current access token: a different user, a logout/login, or
 *    a token refresh (which happens after every permission change) starts clean.
 *  - Entries expire (per-entry max age) and can carry a version (e.g. the role
 *    list's permission_count); a version mismatch is a miss.
 *  - Cleared on role create / edit / delete and user-role assignment
 *    (rbacService), on the WebSocket permissions push (Header), and on the
 *    app-wide `permissions-updated` event.
 *  - Memory only: a reload or a new tab starts clean.
 */

type Entry = { value: unknown; at: number; scope: string; version?: string };
const store = new Map<string, Entry>();

function currentScope(): string | null {
  try {
    return getTokens().accessToken || null;
  } catch {
    return null;
  }
}

export function readRbacCache<T>(key: string, maxAgeMs: number, version?: string): T | undefined {
  const scope = currentScope();
  if (!scope) return undefined;
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.scope !== scope || Date.now() - hit.at > maxAgeMs || hit.version !== version) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function writeRbacCache<T>(key: string, value: T, version?: string): void {
  const scope = currentScope();
  if (!scope) return;
  store.set(key, { value, at: Date.now(), scope, version });
}

export function clearRbacSessionCache(): void {
  store.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('permissions-updated', clearRbacSessionCache);
}
