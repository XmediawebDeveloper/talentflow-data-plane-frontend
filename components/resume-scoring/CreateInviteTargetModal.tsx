'use client';

import { ArrowRight, CheckCircle2, ClipboardList, Info, Send, Undo2, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InviteHandoffKind } from '@/lib/utils/resumeScoringInviteHandoff';

/**
 * The step before leaving Resume Scoring (or AI Talent Match — see
 * `sourceLabel`) to create the AI Assessment / AI Interview a job is
 * missing. Says, in three steps, exactly what will happen — create &
 * publish, come back, invite — and that nothing picked here is
 * lost, so a first-time user is never surprised by where they land.
 */
export default function CreateInviteTargetModal({
  kind,
  jdCode,
  jdTitle,
  candidateCount,
  sourceLabel = 'Resume Scoring',
  onCancel,
  onStart,
}: {
  kind: InviteHandoffKind;
  jdCode?: string;
  jdTitle: string;
  candidateCount: number;
  /** The page the user comes back to. */
  sourceLabel?: string;
  onCancel: () => void;
  onStart: () => void;
}) {
  const what = kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
  const Icon = kind === 'assessment' ? ClipboardList : Video;
  const people = `${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`;
  const steps = [
    {
      icon: Icon,
      title: `Create & publish the ${what}`,
      text: `For ${jdCode ? `${jdCode} · ` : ''}${jdTitle}. You'll be taken to the ${what} setup.`,
    },
    {
      icon: Undo2,
      title: 'Come back here',
      text: `When it is published, one click brings you back to ${sourceLabel}.`,
    },
    {
      icon: Send,
      title: `Invite your ${people}`,
      text: 'The invite opens with the same candidates already picked.',
    },
  ];

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-invite-target-title"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-amber-50 ring-1 ring-amber-100 items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 id="create-invite-target-title" className="tf-section-title sm:text-lg break-words">
                No {what} for this job yet
              </h3>
              <p className="tf-body-muted mt-1 break-words">
                {jdCode ? `${jdCode} · ` : ''}{jdTitle}
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onCancel} className="flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 sm:p-6 min-h-0 overflow-y-auto flex-1 space-y-4">
          <p className="tf-body">
            To invite candidates to an {what}, the job needs a published one first. Here is how it goes:
          </p>

          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="relative flex-shrink-0">
                  <span className="w-8 h-8 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue flex items-center justify-center text-sm font-semibold">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span aria-hidden className="absolute left-1/2 top-8 -translate-x-1/2 w-px h-3 bg-brand-blue/20" />
                  )}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="flex items-center gap-1.5 tf-row-title">
                    <step.icon className="w-4 h-4 text-brand-blue" />
                    {step.title}
                  </span>
                  <span className="block tf-body-muted mt-0.5">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
            <p className="tf-body">
              Your view, filters and the {people} you selected are kept while you're away.
            </p>
          </div>
          <p className="flex items-start gap-2 tf-meta">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Changed your mind? Use “{sourceLabel}” in the breadcrumb at any step to come back.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 py-4 sm:px-6 border-t border-gray-200 shrink-0">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onStart} icon={<ArrowRight className="w-4 h-4" />}>
            Create {what}
          </Button>
        </div>
      </div>
    </div>
  );
}
