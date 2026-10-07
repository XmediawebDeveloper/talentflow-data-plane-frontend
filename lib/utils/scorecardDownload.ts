import { scoringService } from '@/lib/services/scoringService';

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

/**
 * Many scorecards as one ZIP, each candidate inside a per-job folder
 * ("JD-247-Python_Developer-V2/…"). Built client-side because the server's
 * own bulk zip has no notion of "job" and drops every PDF flat — unreadable
 * once one download spans several jobs.
 *
 * @param fallbackJobTitle folder title for a row that carries none.
 */
export async function downloadScorecardsZip(
  rows: ScorecardRow[],
  archiveName: string,
  fallbackJobTitle = 'Job',
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // Disambiguates two same-named candidates in the same job folder so the
  // second file doesn't silently overwrite the first.
  const namesUsedInFolder = new Map<string, number>();
  // Small batches — one request per candidate, so an unbounded burst over a
  // large selection would hammer the API.
  const BATCH_SIZE = 5;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const pdfBlob = await scoringService.downloadScorecard(row.id);
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
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, archiveName);
}
