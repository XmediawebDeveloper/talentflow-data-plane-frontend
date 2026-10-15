'use client';

import { useEffect, useState } from 'react';
import { Eye, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import AIInterviewDetailsView from './AIInterviewDetailsView';

/**
 * Read-only popup of one interview's Interview Details → Configure Details
 * section, opened from the Send Invite picker's eye. Renders the details
 * page itself in `configureOnly` mode, so the preview is always exactly what
 * that tab shows. Stacks above the picker (z-60 over its z-50).
 */
export default function ConfigurePreviewDialog({
  configId,
  onClose,
  cancelInFooter = false,
}: {
  configId: string;
  onClose: () => void;
  /** Close from a Cancel button in a footer instead of the header's X. Off by default. */
  cancelInFooter?: boolean;
}) {
  const [config, setConfig] = useState<AIInterviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    aiInterviewService.get(configId)
      .then((full) => { if (!cancelled) setConfig(full); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load interview'); });
    return () => { cancelled = true; };
  }, [configId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = config?.jd_title || config?.position || 'Interview';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Interview configuration preview"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 w-full max-w-[95vw] lg:max-w-5xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Eye className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {config?.jd_short_id && <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>}
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate">{title}</h2>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Configure Details</p>
            </div>
          </div>
          {!cancelInFooter && (
            <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close" className="px-2 flex-shrink-0">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <p className="text-sm text-destructive text-center py-12">{error}</p>
          ) : !config ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
            </div>
          ) : (
            <AIInterviewDetailsView config={config} onBack={onClose} configureOnly />
          )}
        </div>

        {/* Footer — outside the scrolling body, so Cancel stays in view; the
            Invite popup's footer chrome. */}
        {cancelInFooter && (
          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none !h-9">
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
