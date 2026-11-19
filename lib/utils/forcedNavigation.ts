/**
 * Forced navigations — redirects the app makes on the user's behalf after the
 * session is gone (inactivity timeout, logout, a 401, an access block).
 *
 * Pages with unsaved-changes protection (JD Creation, Assessment Creation)
 * register a `beforeunload` handler that makes Chrome ask "Leave site? Changes
 * you made may not be saved." That prompt is right when the USER closes or
 * reloads the tab — but on a forced sign-out it only blocks the redirect: the
 * tokens are already cleared, so nothing on the page can be saved anyway.
 *
 * `forceNavigate()` marks the navigation before it starts; those handlers check
 * `isForcedNavigation()` and stay silent. The flag lives on `window` so every
 * bundle chunk sees the same value, and the page unloads right after, so it
 * never needs resetting.
 */
type ForcedNavWindow = Window & { __tfForcedNavigation?: boolean };

export function isForcedNavigation(): boolean {
  return typeof window !== 'undefined' && !!(window as ForcedNavWindow).__tfForcedNavigation;
}

export function forceNavigate(url: string): void {
  if (typeof window === 'undefined') return;
  (window as ForcedNavWindow).__tfForcedNavigation = true;
  window.location.href = url;
}
