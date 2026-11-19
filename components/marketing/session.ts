"use client";

import { useSyncExternalStore } from "react";
import { hasStoredSession } from '@/lib/services/api';

/**
 * Whether the visitor has a session, as the routing proxy sees it.
 *
 * proxy.ts sends anyone with an `accessToken` cookie away from /signup and
 * /login to /dashboard, so a "Start free trial" link would silently land a
 * signed-in visitor on their dashboard. Marketing CTAs use this to offer the
 * honest destination instead. The cookie is checked first because it is what
 * the proxy reads; localStorage is the client-side signal the app also sets.
 */
export function readSignedIn(): boolean {
  if (typeof document === "undefined") return false;
  const hasCookie = document.cookie.split(";").some((c) => {
    const [name, value] = c.trim().split("=");
    return name === "accessToken" && !!value;
  });
  if (hasCookie) return true;
  try {
    return hasStoredSession();
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

/** `false` during SSR and hydration, then the real value on the client. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(noopSubscribe, readSignedIn, () => false);
}

export const DASHBOARD_HREF = "/dashboard";
