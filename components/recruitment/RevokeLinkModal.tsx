'use client';

import { AlertTriangle, Info, Loader2, SquarePen, Unlink, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface RevokeLinkModalProps {
  isOpen: boolean;
  /** "interview" | "assessment" — drives the title and copy. */
  kind: 'interview' | 'assessment';
  /** The candidate the link was sent to. */
  email?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The revoke-link confirm shared by Recruitment → Assessments and Recruitment
 * → AI Interview: warning disc + title, the candidate's email, the
 * "What will happen?" list and a bordered Cancel / Revoke Link footer.
 */
export default function RevokeLinkModal({
  isOpen,
  kind,
  email,
  onConfirm,
  onCancel,
  isLoading = false,
}: RevokeLinkModalProps) {
  if (!isOpen) return null;

  const title = kind === 'interview' ? 'Revoke Interview Link?' : 'Revoke Assessment Link?';
  const effects = [
    { icon: Unlink, text: `The current ${kind} link will be immediately deactivated.` },
    { icon: UserRound, text: `The candidate will not be able to access the ${kind} using this link.` },
    { icon: SquarePen, text: "You can edit the candidate's details and send a new invitation afterwards." },
  ];

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-link-title"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-xl animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges"
      >
        <div className="flex-1 min-h-0 px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-destructive-subtle flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" />
          </div>
          <h2 id="revoke-link-title" className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
            {title}
          </h2>
          <div className="mt-2 text-sm sm:text-base text-gray-600 dark:text-slate-400 leading-relaxed">
            <p>This will immediately expire the {kind} link sent to</p>
            {email && (
              <span className="inline-block max-w-full mt-1 px-2 py-0.5 rounded-md bg-destructive-subtle text-destructive font-medium break-all">
                {email}
              </span>
            )}
          </div>

          {/* What will happen */}
          <div className="mt-5 text-left rounded-xl border border-destructive-line bg-destructive-subtle/60 px-3 sm:px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Info className="w-5 h-5 shrink-0 text-destructive" />
              <p className="text-base font-bold text-destructive">What will happen?</p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {effects.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-gray-700 dark:text-slate-300">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-destructive-subtle flex items-center justify-center">
                    <Icon className="w-4 h-4 text-destructive" />
                  </span>
                  <span className="min-w-0 pt-2 sm:pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="w-full sm:w-auto sm:min-w-[128px] px-6">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading} className="w-full sm:w-auto sm:min-w-[160px] px-6">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Revoking…' : 'Revoke Link'}
          </Button>
        </div>
      </div>
    </div>
  );
}
