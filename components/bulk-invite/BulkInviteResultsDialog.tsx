'use client';

import { Minus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import BulkInviteProgressPanel from './BulkInviteProgressPanel';
import type { BulkInviteResultsTab, TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';

/**
 * A bulk send's progress and results, opened from the floating progress
 * widget anywhere in the app (the popup that started the send may be long
 * closed). The standard AppModal in its white (`plain`) header, Cancel in the
 * footer, no ✕. The subtitle names what was sent the way the invite popup
 * does: "JD-343 Senior AI Engineer V1 - Assessment V1", with the app's own
 * Job ID badge and version pills.
 */
export default function BulkInviteResultsDialog({
  job,
  onClose,
  onMinimize,
  initialTab = 'all',
}: {
  job: TrackedBulkInvite;
  /** The tab to open on (a count clicked in the widget). */
  initialTab?: BulkInviteResultsTab;
  /** Close (and Esc): back to the widget's mini popup. */
  onClose: () => void;
  /** Minimize, top right: down to the widget's round icon. */
  onMinimize?: () => void;
}) {
  const kindLabel = job.kind === 'assessment' ? 'Assessment' : 'AI Interview';
  const jdTitle = job.jdTitle ?? job.jd_title ?? undefined;
  const jdCode = job.jdCode ?? job.jd_code ?? undefined;
  const jobVersion = job.jobVersion ?? job.job_version ?? undefined;
  /* Who sent it, when, how, and for how long the links work. */
  const sentAt = job.created_at ? new Date(job.created_at) : null;
  const meta = [
    `${job.total} candidate${job.total === 1 ? '' : 's'}`,
    sentAt && !Number.isNaN(sentAt.getTime()) ? `Sent ${sentAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : null,
    job.sender_name ? `by ${job.sender_name}` : null,
    job.mode === 'resend' ? 'New links by email' : job.delivery === 'link' ? 'Links only' : 'By email',
    job.mode === 'resend' || job.expiry_days == null ? null : job.expiry_days === 0 ? 'No expiry' : `Links expire in ${job.expiry_days} day${job.expiry_days === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
  /* Runs tracked before the versions were recorded: read the version from the
     label the backend keeps ("… - Version 1"). */
  const version = job.versionNumber ?? job.version_number ?? (Number(/version\s*(\d+)/i.exec(job.version_label ?? '')?.[1]) || undefined);
  const subtitle = (
    <span className="block whitespace-normal">
      {jdTitle || jdCode ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {jdCode && <JobIdBadge className="flex-shrink-0">{jdCode}</JobIdBadge>}
          {jdTitle && <span className="min-w-0 [overflow-wrap:anywhere] text-gray-900 dark:text-slate-100">{jdTitle}</span>}
          {jobVersion ? <VersionPill kind="job" version={jobVersion} /> : null}
          <span className="whitespace-nowrap text-gray-900 dark:text-slate-100">- {kindLabel}</span>
          {version ? <VersionPill kind="assessment" version={version} /> : null}
          {job.mode === 'resend' && <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-2xs font-medium text-gray-700 dark:text-slate-300">Resend</span>}
        </span>
      ) : (job.version_label || null)}
      <span className="mt-1 block tf-meta">{meta}</span>
    </span>
  );
  return (
    <AppModal
      open
      onCancel={onClose}
      cancelLabel="Close"
      size="xl"
      tone="plain"
      icon={<Send className="w-4 h-4 text-brand-blue" />}
      title={job.mode === 'resend' ? `${kindLabel} — new links` : `${kindLabel} invitations`}
      subtitle={subtitle}
      zIndexClass="z-[70]"
      headerExtra={onMinimize ? (
        <Button variant="secondary" size="sm" onClick={onMinimize} className="w-8 !px-0" aria-label="Minimize" title="Minimize — sending carries on; the icon stays bottom right">
          <Minus className="w-4 h-4" />
        </Button>
      ) : undefined}
      /* Same 16px above the "Invitation process completed" box as the panel
         leaves below it (its space-y-4), not the body's default 24px. */
      bodyClassName="pt-4 sm:pt-4"
    >
      <BulkInviteProgressPanel jobId={job.job_id} initialJob={job} initialTab={initialTab} />
    </AppModal>
  );
}
