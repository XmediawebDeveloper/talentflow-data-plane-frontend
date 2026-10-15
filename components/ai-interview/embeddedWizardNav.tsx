'use client';

import { createContext, useContext, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * The AI interview wizard (Configure → Clusters → Preview & Publish) run inside
 * a popup instead of on its pages. Each step still navigates with
 * `router.push` / `router.replace` / `router.back` and reads its params off
 * the URL; inside `AIInterviewWizardDialog` those go to this in-memory address
 * instead of the browser's, so the steps' own logic is unchanged and the page
 * behind the popup never moves.
 */
export interface EmbeddedWizardNav {
  /** The step's address, e.g. `/recruitment/ai-interviews/…/clusters?id=…`. */
  href: string;
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  /** Leave the wizard — the popup closes and the host re-reads its list. */
  exit: () => void;
}

const EmbeddedWizardContext = createContext<EmbeddedWizardNav | null>(null);
export const EmbeddedWizardProvider = EmbeddedWizardContext.Provider;

/** The popup's navigator, or null on the wizard's own pages. */
export const useEmbeddedWizard = () => useContext(EmbeddedWizardContext);

/** `useRouter`, routed to the popup's address while the wizard is embedded. */
export function useWizardRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const nav = useContext(EmbeddedWizardContext);
  return useMemo(
    () => (nav
      ? { ...router, push: (href: string) => nav.push(href), replace: (href: string) => nav.replace(href), back: () => nav.back() }
      : router),
    [router, nav],
  );
}

/** `useSearchParams`, read off the popup's address while the wizard is embedded. */
export function useWizardSearchParams(): ReturnType<typeof useSearchParams> {
  const params = useSearchParams();
  const nav = useContext(EmbeddedWizardContext);
  const query = nav ? (nav.href.split('?')[1] ?? '') : null;
  return useMemo(
    () => (query === null ? params : (new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>)),
    [params, query],
  );
}
