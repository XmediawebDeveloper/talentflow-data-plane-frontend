'use client';

import { useState } from 'react';
import { Eye, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadSessionReport, downloadSessionReports, canTryReport, NoReportError } from './evaluation-dashboard/downloadSessionReport';

/** Below Tailwind's `sm` (640px) — where the results lists default to cards. */
export const isPhoneWidth = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

/**
 * Toolbar "Download PDF" — the evaluation reports of the selected rows,
 * skipping those with no report yet. Disabled until a row is selected,
 * like Export beside it.
 */
export function DownloadPdfsButton({
  getRows,
  selectedCount,
  zipName,
}: {
  getRows: () => Promise<any[]> | any[];
  selectedCount: number;
  zipName: string;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleClick = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const rows = await getRows();
      const { downloaded, skipped, failed } = await downloadSessionReports(
        rows, zipName, (done, total) => setProgress({ done, total }),
      );
      if (downloaded === 0 && failed === 0) {
        toast.warning('No evaluated candidates to download — reports are available once an interview is evaluated.');
      } else if (failed > 0) {
        toast.error(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}; ${failed} could not be generated.`);
      } else if (skipped > 0) {
        toast.success(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}. ${skipped} candidate${skipped === 1 ? ' has' : 's have'} no report yet.`);
      }
    } catch (err) {
      console.error('[DownloadPdfsButton] failed:', err);
      toast.error('Could not download the reports. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  const noneSelected = selectedCount === 0;
  return (
    // Wrapper carries the tooltip — a disabled button shows none.
    <span title={noneSelected ? 'Select candidates to download their reports' : undefined} className="inline-flex">
      <Button
        variant="primary"
        size="sm"
        onClick={handleClick}
        disabled={noneSelected || !!progress}
        icon={progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        title={noneSelected ? undefined : 'Download the evaluation report PDFs of the selected candidates'}
        className="whitespace-nowrap !h-[38px] !text-sm"
      >
        {progress
          ? progress.total > 1 ? `Preparing ${progress.done}/${progress.total}…` : 'Preparing…'
          : (
            // One span, so the button's flex gap doesn't split the words.
            // "PDF" alone on phones, where the toolbar wraps.
            <span><span className="hidden sm:inline">Download </span>PDF{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
          )}
      </Button>
    </span>
  );
}

/**
 * The Actions cell of the AI Interview results lists: an eye icon for View
 * Details and a download icon for the candidate's evaluation report — the
 * same PDF the result page's "Download Report (PDF)" saves. Download is
 * disabled (with the reason on hover) until there is a report to download.
 */
export default function ResultRowActions({ session, onView }: { session: any; onView: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = canTryReport(session);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSessionReport(session.id);
    } catch (err) {
      if (err instanceof NoReportError) {
        toast.warning('No report yet — it is available once the interview is evaluated.');
        return;
      }
      console.error('[ResultRowActions] report download failed:', err);
      toast.error('Could not download the report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="secondary"
        size="sm"
        onClick={onView}
        title="View Details"
        aria-label="View Details"
        className="!w-8 !h-8 !px-0"
      >
        <Eye className="w-4 h-4" />
      </Button>
      {/* Wrapper carries the tooltip — a disabled button shows none. */}
      <span title={canDownload ? undefined : 'Report available once the interview is evaluated'} className="inline-flex">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleDownload}
        disabled={!canDownload || downloading}
        title={canDownload ? 'Download Report (PDF)' : undefined}
        aria-label="Download Report"
        className="!w-8 !h-8 !px-0"
      >
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </Button>
      </span>
    </div>
  );
}
