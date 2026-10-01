'use client';

import { Eye, Sliders, X } from 'lucide-react';
import { useRef } from 'react';
import AssessmentCreation, { type AssessmentCreationHandle } from './AssessmentCreation';
import { Button } from '@/components/ui/button';

interface AssessmentConfigureModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The assessment being configured. Needs `id` and `jd_id`. */
  assessment: any;
  /**
   * Saved — as a draft or republished. The host reloads the record behind the
   * popup; the popup closes itself either way.
   */
  onSaved?: () => void;
  /**
   * VIEW-ONLY. The same dialog and the same Configure step, with every control
   * non-operable and the Save as Draft / Publish card gone — what the New
   * Versions tab's preview opens, so a recruiter reads a version's
   * configuration in the form that configures it rather than in a second
   * layout written to describe it.
   *
   * Off by default: the Edit action opens this dialog unchanged.
   */
  readOnly?: boolean;
}

/**
 * THE ASSESSMENT CONFIGURE STEP, AS A POPUP.
 *
 * The Edit action on the assessment details page opens this. It is the same
 * Configure form the create flow runs at
 * `/recruitment/assessments/create?step=configure&jd_id=…&edit=…` — the rounds
 * and their sections, the percentage split, the HR question picks, the coding
 * languages, proctoring, and the Save as Draft / Publish pair that end the
 * step — rendered by the same component (`AssessmentCreation` in `embedded`
 * mode) rather than copied into a second form that would then have to be kept
 * in step with it.
 *
 * A POPUP, because Edit is not a change of subject: the recruiter is reading
 * an assessment and wants to adjust it. Sending them to another route took the
 * record off screen, put a different breadcrumb in front of them, and made
 * getting back a navigation. Here the page they were on is still behind the
 * dialog, and closing returns them to it with nothing to retrace.
 *
 * What `embedded` mode changes in the flow — and it is only ever these things:
 * the step, the JD and the assessment come from props instead of the URL;
 * nothing rewrites the address bar (the host page's route has to survive);
 * publishing hands the record back here instead of moving on to the create
 * flow's Publish Assessment page; and the page's own shell — its breadcrumb,
 * heading and white card — is left to this dialog, whose header carries the
 * title and job. The form itself is untouched.
 */
export default function AssessmentConfigureModal({
  isOpen,
  onClose,
  assessment,
  onSaved,
  readOnly = false,
}: AssessmentConfigureModalProps) {
  /* `jd_id` is not optional here: the Configure step is scoped to a job — it
     reads the JD's skills, experience and coding requirements to lay itself
     out — so an assessment with no job behind it has nothing to configure.
     Callers fall back to the plain edit dialog in that case, the same way the
     route's draft redirect is gated on `jd_id`. */
  const assessmentCreationRef = useRef<AssessmentCreationHandle>(null);

  if (!isOpen || !assessment?.id || !assessment?.jd_id) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Wider than this app's other dialogs because the Configure step is a
          two-column layout at `lg`; below that it stacks as it does on the
          page. The panel owns the scrolling, which is why the step renders
          without its own scroll container inside a popup. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl lg:max-w-6xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header — the house dialog header: tile, title, one line of context,
            close. It names the step and the job, which is what the page's own
            heading says, so the body does not repeat it. */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Sliders className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              {/* Same heading either way — this IS the Configure step, and a
                  preview that renamed it would stop matching the form it is
                  showing. The chip beside it is the one difference: the same
                  mode pill the assessment preview dialog carries, so "you
                  cannot change anything here" is stated rather than left to be
                  discovered by pressing a control that does not respond. */}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight min-w-0 truncate">
                  Configure Assessment
                </h2>
                {readOnly && (
                  <span className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-2xs sm:text-xs flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                    <Eye className="w-3 h-3" />
                    View only
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 truncate">
                {readOnly ? 'Duration, section distribution, and topics for ' : 'Set duration, section distribution, and topics for '}
                <span className="text-brand-blue font-medium">
                  {assessment.jd_title || assessment.job?.title || 'this job'}
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => assessmentCreationRef.current?.requestClose()}
            aria-label={readOnly ? 'Close assessment preview' : 'Close assessment configuration'}
            className="px-2 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content — the Configure step itself. The panel is the white card
            the step draws for itself on the page, and it owns the scrolling,
            which is why the step renders neither inside a popup. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AssessmentCreation
            ref={assessmentCreationRef}
            embedded
            readOnly={readOnly}
            editAssessmentId={assessment.id}
            preSelectedJobId={assessment.jd_id}
            /* The flow fetches every JD version itself on mount (and resolves
               a pre-selected one by id when the list does not carry it), so
               there is no seed list for the popup to pass. `topicSettings` and
               `proctoringSettings` are the create path's DEFAULTS for a new
               assessment; edit mode reads both off the record being edited. */
            jobs={[]}
            onBack={onClose}
            onCreateAssessment={() => {
              onSaved?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
