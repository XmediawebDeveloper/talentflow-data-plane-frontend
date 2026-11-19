import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';
import { errorNextStep } from '@/lib/utils/errorToast';

/**
 * Scorecard PDF downloads for Resume Scoring — shared by ScoredResumesTable
 * (View by Candidates, a job's own page) and View by Job's Actions menu, so
 * both produce the same files with the same names and folder layout.
 */

/** The fields of a scored row these downloads read. */
export interface ScorecardRow {
  id: string;
  candidateName?: string;
  jobTitle?: string;
  jobCode?: string;
  jobVersion?: number;
  version?: number;
  resumeVersion?: number;
}

/* "_(V3)" for the resume version(s) — a range ("_(V1-V3)") when several;
   nothing when no row carries a version number. */
export const scorecardVersionTag = (rows: ScorecardRow[]): string => {
  const versions = Array.from(new Set(
    rows.map(r => r.version || r.resumeVersion).filter((v): v is number => !!v),
  )).sort((a, b) => a - b);
  if (versions.length === 0) return '';
  if (versions.length === 1) return `_(V${versions[0]})`;
  return `_(V${versions[0]}-V${versions[versions.length - 1]})`;
};

/** DD-MM-YYYY for filenames (filename-safe, fixed width). */
export const formatFileDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
};

const triggerDownload = (blob: Blob, name: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const safeName = (s: string) => s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');

/** One scorecard PDF, saved under `fileName`. */
export async function downloadScorecardPdf(row: ScorecardRow, fileName: string): Promise<void> {
  const rawBlob = await scoringService.downloadScorecard(row.id);
  // Correct MIME type for cross-platform PDF rendering.
  triggerDownload(new Blob([rawBlob], { type: 'application/pdf' }), fileName);
}

export interface ScorecardsZipResult {
  total: number;
  succeeded: number;
  /** Display names of the candidates whose scorecard could not be fetched. */
  failed: string[];
}

export type ScorecardsZipProgress = (p: { done: number; total: number; phase: 'fetching' | 'zipping' }) => void;

/**
 * Many scorecards as one ZIP, each candidate inside a per-job folder
 * ("JD-247-Python_Developer-V2/…"). Built client-side because the server's
 * own bulk zip has no notion of "job" and drops every PDF flat — unreadable
 * once one download spans several jobs.
 *
 * One PDF failing no longer sinks the archive: the rest are still zipped, the
 * misses are listed in a `_FAILED_SCORECARDS.txt` inside it, and the result
 * reports them. It throws only when not a single PDF could be fetched.
 *
 * @param fallbackJobTitle folder title for a row that carries none.
 * @param onProgress called after each PDF settles (fetched or failed), then
 *   once more with phase 'zipping' while the archive is compressed.
 */
export async function downloadScorecardsZip(
  rows: ScorecardRow[],
  archiveName: string,
  fallbackJobTitle = 'Job',
  onProgress?: ScorecardsZipProgress,
): Promise<ScorecardsZipResult> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // Disambiguates two same-named candidates in the same job folder so the
  // second file doesn't silently overwrite the first.
  const namesUsedInFolder = new Map<string, number>();
  const failed: string[] = [];
  let done = 0;
  onProgress?.({ done, total: rows.length, phase: 'fetching' });
  // Small batches — one request per candidate, so an unbounded burst over a
  // large selection would hammer the API.
  const BATCH_SIZE = 5;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      let pdfBlob: Blob;
      try {
        pdfBlob = await scoringService.downloadScorecard(row.id);
      } catch (error) {
        console.error(`Scorecard fetch failed for ${row.id}:`, error);
        const label = [row.candidateName || 'Candidate', row.jobCode || row.jobTitle].filter(Boolean).join(' — ');
        failed.push(label);
        return;
      } finally {
        done += 1;
        onProgress?.({ done, total: rows.length, phase: 'fetching' });
      }
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
      // JD code and version in the folder name: a title alone can't tell two
      // scored versions (or a recreated JD) apart.
      const folderName = [
        row.jobCode ? sanitize(row.jobCode) : null,
        sanitize(row.jobTitle || fallbackJobTitle) || 'Job',
        row.jobVersion ? `V${row.jobVersion}` : null,
      ].filter(Boolean).join('-');
      const candidate = safeName(row.candidateName || 'Candidate') || 'Candidate';
      const dedupeKey = `${folderName}/${candidate}`;
      const priorCount = namesUsedInFolder.get(dedupeKey) ?? 0;
      namesUsedInFolder.set(dedupeKey, priorCount + 1);
      const fileName = `${candidate}${priorCount ? `_${priorCount + 1}` : ''}${scorecardVersionTag([row])}_Scorecard.pdf`;
      zip.folder(folderName)!.file(fileName, pdfBlob);
    }));
  }

  const succeeded = rows.length - failed.length;
  if (succeeded === 0) {
    throw new Error('None of the selected scorecards could be downloaded');
  }
  if (failed.length > 0) {
    zip.file(
      '_FAILED_SCORECARDS.txt',
      `These ${failed.length} scorecard(s) could not be downloaded and are missing from this ZIP:\r\n\r\n` +
        failed.map((f) => `- ${f}`).join('\r\n') + '\r\n',
    );
  }

  onProgress?.({ done, total: rows.length, phase: 'zipping' });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, archiveName);
  return { total: rows.length, succeeded, failed };
}

/**
 * downloadScorecardsZip with one live toast for the whole job — progress while
 * it runs ("Preparing scorecards… 45/200"), then success, partial success or
 * failure in the same toast. The toast stays on screen while the user keeps
 * working, so the download no longer depends on watching a button spinner.
 *
 * @returns true when a ZIP was downloaded (even a partial one).
 */
export async function downloadScorecardsZipWithToast(
  rows: ScorecardRow[],
  archiveName: string,
  fallbackJobTitle = 'Job',
): Promise<boolean> {
  const toastId = toast.loading(`Preparing ${rows.length} scorecards… 0/${rows.length}`, {
    description: 'You can keep working — the ZIP downloads when ready.',
  });
  try {
    const result = await downloadScorecardsZip(rows, archiveName, fallbackJobTitle, ({ done, total, phase }) => {
      toast.loading(
        phase === 'zipping' ? `Building ZIP… (${total} scorecards)` : `Preparing scorecards… ${done}/${total}`,
        { id: toastId, description: 'You can keep working — the ZIP downloads when ready.' },
      );
    });
    if (result.failed.length === 0) {
      toast.success(`${result.succeeded} scorecards downloaded`, { id: toastId, description: undefined });
    } else {
      const shown = result.failed.slice(0, 3).join(', ');
      const more = result.failed.length > 3 ? ` and ${result.failed.length - 3} more` : '';
      toast.warning(`${result.succeeded} of ${result.total} scorecards downloaded`, {
        id: toastId,
        description: `${result.failed.length} failed: ${shown}${more}. See _FAILED_SCORECARDS.txt in the ZIP.`,
        duration: 10000,
      });
    }
    return true;
  } catch (error) {
    console.error('Error downloading scorecards ZIP:', error);
    toast.error("Couldn't download the scorecards", {
      id: toastId,
      description: errorNextStep(error),
      action: { label: 'Retry', onClick: () => { void downloadScorecardsZipWithToast(rows, archiveName, fallbackJobTitle); } },
    });
    return false;
  }
}
