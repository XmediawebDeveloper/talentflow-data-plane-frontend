import { Archive } from 'lucide-react';

/** Resume archive-status chip, shared across Resume Database, Resume Scoring,
 *  the JD module's tabs and AI Talent Match. Resume Database keeps the plain
 *  "Archived" wording (it's already inside a resume context); every other
 *  module uses the default "Resume Archived" so it's unambiguous out of
 *  context. */
export function ResumeArchivedBadge({
  label = 'Resume Archived',
  iconOnly = false,
}: {
  label?: string;
  iconOnly?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 flex-shrink-0">
      <Archive className="w-3 h-3" />
      {!iconOnly && label}
    </span>
  );
}
