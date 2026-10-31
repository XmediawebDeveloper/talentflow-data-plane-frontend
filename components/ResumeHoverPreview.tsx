'use client';

import { useState, type ReactNode } from 'react';
import { Briefcase, Mail, MapPin, Phone, Clock } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';

/* One fetch per resume per page load. Keyed by id and holding the promise, so
   hovering off and back on — or two hovers racing — never re-requests it. A
   failed fetch is dropped so the next hover can retry. */
const previewCache = new Map<string, Promise<any>>();

const loadPreview = (id: string) => {
  let pending = previewCache.get(id);
  if (!pending) {
    pending = (async () => {
      const { resumeService } = await import('@/lib/services/resumeService');
      const { convertApiResume } = await import('@/lib/utils/resumeMapper');
      // logView=false: a hover is a glance, not a view — only the click that
      // opens the full resume is logged.
      return convertApiResume(await resumeService.get(id, false));
    })();
    pending.catch(() => previewCache.delete(id));
    previewCache.set(id, pending);
  }
  return pending;
};

const present = (v?: string | null) => !!v && v !== 'N/A' && v !== 'No email' && v !== 'No phone';

interface ResumeHoverPreviewProps {
  resumeId: string;
  /** The View Resume button. Clicking it still opens the full resume. */
  children: ReactNode;
}

/** Hover card over View Resume: a compact read of the candidate's resume, so a
 *  recruiter can check it's the right person without leaving the result. */
export default function ResumeHoverPreview({ resumeId, children }: ResumeHoverPreviewProps) {
  const [state, setState] = useState<{ id: string; resume?: any; failed?: boolean } | null>(null);
  const current = state?.id === resumeId ? state : null;

  const handleOpenChange = (open: boolean) => {
    if (!open || current?.resume) return;
    setState({ id: resumeId });
    loadPreview(resumeId)
      .then(resume => setState(s => (s?.id === resumeId ? { id: resumeId, resume } : s)))
      .catch(() => setState(s => (s?.id === resumeId ? { id: resumeId, failed: true } : s)));
  };

  const resume = current?.resume;
  const skills: string[] = resume
    ? [...new Set<string>(
        [...(resume.technicalSkills || []), ...(resume.skills || [])]
          // Parsed skills arrive as plain strings or as { name } records.
          .map((s: any) => (typeof s === 'string' ? s : s?.name || s?.skill || ''))
          .map((s: string) => s.trim())
          .filter(Boolean),
      )]
    : [];
  const latest = resume?.experienceDetails?.[0];
  const subtitle = resume
    ? [present(resume.title) ? resume.title : null, resume.currentCompany].filter(Boolean).join(' · ')
    : '';

  return (
    <HoverCard openDelay={250} closeDelay={120} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        <span className="inline-flex flex-shrink-0">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[calc(100vw-32px)] p-0 overflow-hidden bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-xl shadow-xl"
      >
        {current?.failed ? (
          <p className="p-4 tf-body-muted">Couldn&apos;t load the resume preview. Click View Resume to open it.</p>
        ) : !resume ? (
          <div className="p-4 space-y-3" aria-busy="true">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 flex items-start gap-3 border-b border-gray-100 dark:border-slate-800">
              <div className="h-10 w-10 rounded-full bg-brand-blue text-white grid place-items-center text-sm font-semibold flex-shrink-0">
                {(resume.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="tf-cell-name truncate">{resume.name}</p>
                {subtitle && <p className="tf-meta-strong truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="p-4 space-y-3 tf-meta-strong">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {present(resume.email) && (
                  <span className="flex items-center gap-1.5 min-w-0 col-span-2"><Mail className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" /><span className="truncate">{resume.email}</span></span>
                )}
                {present(resume.phone) && (
                  <span className="flex items-center gap-1.5 min-w-0"><Phone className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" /><span className="truncate">{resume.phone}</span></span>
                )}
                {present(resume.experience) && (
                  <span className="flex items-center gap-1.5 min-w-0"><Clock className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" /><span className="truncate">{resume.experience}</span></span>
                )}
                {present(resume.location) && (
                  <span className="flex items-center gap-1.5 min-w-0 col-span-2"><MapPin className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" /><span className="truncate">{resume.location}</span></span>
                )}
              </div>
              {resume.professionalSummary && (
                <p className="text-gray-700 dark:text-slate-300 leading-relaxed line-clamp-3">{resume.professionalSummary}</p>
              )}
              {latest && (latest.title || latest.company) && (
                <div className="flex items-start gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-blue" />
                  <div className="min-w-0">
                    <p className="text-gray-800 dark:text-slate-200 font-medium truncate">{[latest.title, latest.company].filter(Boolean).join(' · ')}</p>
                    {(latest.startDate || latest.duration) && (
                      <p className="truncate">{latest.startDate ? `${latest.startDate} – ${latest.endDate}` : latest.duration}</p>
                    )}
                  </div>
                </div>
              )}
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice(0, 8).map(skill => (
                    <span key={skill} className="px-2 py-0.5 rounded-full bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">{skill}</span>
                  ))}
                  {skills.length > 8 && <span className="px-2 py-0.5 text-gray-500 dark:text-slate-500">+{skills.length - 8} more</span>}
                </div>
              )}
            </div>
            <p className="px-4 py-2 text-2xs text-gray-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-800">
              Click View Resume to open the full resume
            </p>
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
