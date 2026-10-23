'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmbeddedWizardNav } from './embeddedWizardNav';

/** `leaveTarget` for the browser's Back button. */
export const LEAVE_BACK = '__back__';
/** `leaveTarget` for the wizard popup's footer Cancel: the popup closes. */
export const LEAVE_EXIT = '__exit__';

const AI_INTERVIEWS_PATH = '/recruitment/ai-interviews';

/* The AI Interviews crumb opens that page on its list, not its overview cards —
   like every other way out of the wizard (Configure's openInterviewListView;
   AIInterview.tsx reads the flag on mount). */
const openInterviewListView = () => {
  try { sessionStorage.setItem('ai_interviews_open_list_view', 'pending'); } catch { /* list opens on its cards instead */ }
};

/**
 * The leave guard for an AI Interview wizard step (Clusters, Preview & Publish;
 * Configure keeps its own older copy of the same handlers). It catches every
 * way out the page can see —
 *
 *   - an in-app link or breadcrumb (capture-phase click on an internal <a> /
 *     role="link", before Next's <Link> handles it),
 *   - the browser's Back (a same-URL history entry pushed on load, so Back
 *     lands on it and fires popstate instead of leaving),
 *   - reload / tab close (the browser's own "Leave site?" prompt),
 *   - the wizard popup's footer Cancel —
 *
 * and asks `needsPrompt()` each time. Nothing to lose → it lets the leave
 * through untouched; otherwise it holds it in `leaveTarget` for the step's
 * LeaveInterviewDialog, which ends in `leaveTo(leaveTarget)` once the recruiter
 * has chosen.
 *
 * `needsPrompt` is read through a ref, so handlers registered once still see
 * the step's latest state.
 */
export function useInterviewLeaveGuard({
  active,
  wizardNav,
  needsPrompt,
}: {
  /** The step has loaded its config; before that there is nothing to guard. */
  active: boolean;
  wizardNav: EmbeddedWizardNav | null;
  needsPrompt: () => boolean;
}) {
  /* The page's own router, not the wizard's: a link clicked while the wizard
     is a popup leads to a real page, after the popup closes. */
  const pageRouter = useRouter();
  const embedded = !!wizardNav;
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  /* Set by a departure some handler is already driving (a Save / Discard
     settling the leave, Continue moving through the wizard), so the guards
     stand aside for it. */
  const isNavigatingRef = useRef(false);
  const needsPromptRef = useRef(needsPrompt);
  useEffect(() => {
    needsPromptRef.current = needsPrompt;
  });

  /** Carry out a leave — a held `leaveTarget`, or one that needs no prompt. */
  const leaveTo = useCallback((target: string) => {
    isNavigatingRef.current = true;
    setLeaveTarget(null);
    if (target === LEAVE_BACK) {
      // Two steps: the trap entry re-pushed when Back was caught, then this
      // page's own entry — both are this URL. One step lands on the page again.
      window.history.go(-2);
      return;
    }
    if (target === LEAVE_EXIT) {
      wizardNav?.exit();
      return;
    }
    if (target === AI_INTERVIEWS_PATH) openInterviewListView();
    wizardNav?.exit();
    pageRouter.push(target);
  }, [wizardNav, pageRouter]);

  /** Leave for `target`, asking first only when there is something to lose. */
  const requestLeave = useCallback((target: string) => {
    if (isNavigatingRef.current) return;
    if (needsPromptRef.current()) setLeaveTarget(target);
    else leaveTo(target);
  }, [leaveTo]);

  /* Browser Back. In the popup the browser's history belongs to the page behind it. */
  useEffect(() => {
    if (!active || embedded) return;
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      if (isNavigatingRef.current) return;
      if (needsPromptRef.current()) {
        window.history.pushState(null, '', window.location.href);
        setLeaveTarget(LEAVE_BACK);
        return;
      }
      // Nothing to lose: Back only consumed the trap entry — take the real step back.
      isNavigatingRef.current = true;
      window.history.back();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [active, embedded]);

  /* In-app links and breadcrumbs. */
  useEffect(() => {
    if (!active) return;
    const handleClick = (e: MouseEvent) => {
      if (isNavigatingRef.current) return;
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            if (!needsPromptRef.current()) {
              if (href === AI_INTERVIEWS_PATH) openInterviewListView();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setLeaveTarget(href);
            return;
          }
        }
        target = target.parentElement;
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [active]);

  /* Reload / tab close: the browser's own prompt — it cannot show ours. */
  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isNavigatingRef.current || !needsPromptRef.current()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);

  /* The wizard popup's footer Cancel. */
  useEffect(() => {
    if (!wizardNav) return;
    wizardNav.setCancelHandler(() => requestLeave(LEAVE_EXIT));
    return () => wizardNav.setCancelHandler(null);
  }, [wizardNav, requestLeave]);

  return {
    leaveTarget,
    /** Cancel in the prompt: stay. */
    cancelLeave: () => setLeaveTarget(null),
    requestLeave,
    leaveTo,
    isNavigatingRef,
  };
}

/**
 * "Has the recruiter changed anything on this step since it loaded?" — the
 * baseline is the step's state when the recruiter first touches the page
 * (pointer / key down, wired by the caller), so values the step settles into
 * while loading never count as a change. Same rule as Configure's.
 */
export function useEditBaseline(snapshot: string) {
  const snapshotRef = useRef(snapshot);
  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const markEditStart = useCallback(() => {
    if (baselineRef.current === null) baselineRef.current = snapshotRef.current;
  }, []);
  const isDirty = useCallback(
    () => baselineRef.current !== null && baselineRef.current !== snapshotRef.current,
    [],
  );
  return { markEditStart, isDirty };
}
