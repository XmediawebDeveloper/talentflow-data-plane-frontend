'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AIInterviewConfig from './AIInterviewConfig';
import AIInterviewClusters from './AIInterviewClusters';
import AIInterviewPreview from './AIInterviewPreview';
import { EmbeddedWizardProvider, type EmbeddedWizardNav } from './embeddedWizardNav';

const WIZARD_PATH = '/recruitment/ai-interviews/jd-selection/ai-interview-config';
const STEP_BY_PATH: Record<string, 'config' | 'clusters' | 'preview'> = {
  [WIZARD_PATH]: 'config',
  [`${WIZARD_PATH}/clusters`]: 'clusters',
  [`${WIZARD_PATH}/preview`]: 'preview',
};
const stepOf = (href: string) => STEP_BY_PATH[href.split('?')[0]] ?? null;

/**
 * THE AI INTERVIEW WIZARD, AS A POPUP — the AI interview counterpart of the
 * Assessment Configure popup (`AssessmentConfigureModal`).
 *
 * Runs the wizard's own steps (Configure → Clusters → Preview & Publish), the
 * same components its pages render, starting at `startHref` (a wizard page's
 * address: Configure for a new interview, or where a draft left off). A step's
 * navigation to another step stays in here; anything else — Save as Draft,
 * Discard, Publish, leaving for a page — ends the flow: the popup closes and
 * `onClose` lets the host re-read its versions. The page behind never moves.
 */
export default function AIInterviewWizardDialog({
  startHref,
  jdCode,
  jdTitle,
  onClose,
}: {
  startHref: string;
  jdCode?: string;
  jdTitle?: string;
  onClose: () => void;
}) {
  /* The steps visited, so a step's Back returns to the one before. */
  const [stack, setStack] = useState<string[]>([startHref]);
  const href = stack[stack.length - 1];
  const step = stepOf(href);

  /* Held in a ref so the navigator — and the steps' `router` — stays the same
     object while the host re-renders with a new `onClose`. */
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  /* The sticky footer's two slots a step portals its actions into. */
  const [footerStartEl, setFooterStartEl] = useState<HTMLElement | null>(null);
  const [footerEndEl, setFooterEndEl] = useState<HTMLElement | null>(null);
  /* A step's own Cancel (e.g. Configure asks to save its changes first). */
  const cancelHandlerRef = useRef<(() => void) | null>(null);

  const nav = useMemo<EmbeddedWizardNav>(() => {
    const exit = () => onCloseRef.current();
    return {
      href,
      push: (to) => (stepOf(to) ? setStack((s) => [...s, to]) : exit()),
      replace: (to) => (stepOf(to) ? setStack((s) => [...s.slice(0, -1), to]) : exit()),
      back: () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : exit()),
      exit,
      footerStartEl,
      footerEndEl,
      setCancelHandler: (handler) => { cancelHandlerRef.current = handler; },
    };
  }, [href, stack.length, footerStartEl, footerEndEl]);

  const handleCancel = () => (cancelHandlerRef.current ?? onCloseRef.current)();

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl lg:max-w-6xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* The house dialog header, as on the Assessment Configure popup. */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight min-w-0 truncate">
                Configure AI Interview
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 min-w-0 flex items-center gap-1.5 flex-wrap">
                {jdCode && <JobIdBadge className="flex-shrink-0">{jdCode}</JobIdBadge>}
                <span className="min-w-0 break-words">{jdTitle || 'this job'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* The step itself. Its page shell (grey page, centred card, shadow,
            full-viewport height) is flattened into this panel, which owns the
            scrolling. Keyed by address: a step remounts on each navigation, as
            it does when its page loads. */}
        <div className="flex-1 min-h-0 overflow-y-auto [&>main]:!bg-white dark:[&>main]:!bg-slate-900 [&>main>div]:!max-w-none [&>main>div>div]:!min-h-0 [&>main>div>div]:!my-0 [&>main>div>div]:!rounded-none [&>main>div>div]:!shadow-none">
          <EmbeddedWizardProvider value={nav}>
            {step === 'config' && <AIInterviewConfig key={href} />}
            {step === 'clusters' && <AIInterviewClusters key={href} />}
            {step === 'preview' && <AIInterviewPreview key={href} />}
          </EmbeddedWizardProvider>
        </div>

        {/* Footer — outside the scrolling body, so it stays in view; the
            Invite popup's footer chrome. A step's leaving actions sit at the
            start; Cancel, then its advancing actions, at the end. Cancel asks
            the step first when it has its own answer (unsaved changes). */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex-shrink-0">
          <div ref={setFooterStartEl} className="flex items-center gap-2 empty:hidden" />
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 sm:ml-auto">
            <Button variant="secondary" type="button" onClick={handleCancel} className="flex-1 sm:flex-none !h-9">
              Cancel
            </Button>
            <div ref={setFooterEndEl} className="contents" />
          </div>
        </div>
      </div>
    </div>
  );
}
