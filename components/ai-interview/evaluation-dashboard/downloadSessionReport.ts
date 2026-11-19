// Row-level "Download report" for the AI Interview results lists. Rebuilds
// the same DashboardData the candidate result page's Eval tab renders from,
// then hands it to the same PDF builder, so the file matches that page's
// "Download Report (PDF)" exactly. List rows are compact, so the full
// session (evaluation, transcript, special_instructions) is fetched first.
import api from '@/lib/services/api';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { buildDashboardData } from './adapter';
import { exportEvalReportPDF } from './EvalReportCombined';
import { getProctoringRisk } from '../proctoringRisk';

const parseClusterConfig = (si?: string | null) => {
  if (!si) return { mth: [], nth: [] };
  try {
    const parsed = JSON.parse(si);
    return { mth: parsed.mth_clusters || [], nth: parsed.nth_clusters || [] };
  } catch { return { mth: [], nth: [] }; }
};

const interviewModeOf = (si?: string | null): string | undefined => {
  if (!si) return undefined;
  try { return JSON.parse(si).interview_mode; } catch { return undefined; }
};

/** True when a session has an evaluation report to download — completed, or
 *  terminated with whatever (partial) evaluation it got. Needs the FULL
 *  session: compact list rows can omit ai_evaluation — use canTryReport there. */
export const hasEvaluationReport = (row: any): boolean => {
  if (!row?.ai_evaluation || row.status === 'in_progress') return false;
  if (row.ai_evaluation.partial === true) return true;
  return row.status === 'completed' || row.status === 'terminated';
};

/** List-row gate. Compact rows can lack ai_evaluation (or its `partial`
 *  flag), so a completed/terminated row is enabled and the full session
 *  fetched on click decides — see NoReportError. */
export const canTryReport = (row: any): boolean =>
  row?.status === 'completed' || row?.status === 'terminated' || hasEvaluationReport(row);

/** Thrown when the full session turns out to have no evaluation yet. */
export class NoReportError extends Error {
  constructor() { super('No evaluation report for this session yet'); this.name = 'NoReportError'; }
}

export async function downloadSessionReport(sessionId: string, save = true) {
  const session: any = await aiInterviewService.get(sessionId);
  if (!hasEvaluationReport(session)) throw new NoReportError();
  // Session first; the parent config when the session didn't inherit its
  // clusters — the same resolution the result page uses.
  let clusterConfig = parseClusterConfig(session.special_instructions);
  if (clusterConfig.mth.length === 0 && clusterConfig.nth.length === 0 && session.config_id) {
    try {
      const cfg: any = await aiInterviewService.get(session.config_id);
      clusterConfig = parseClusterConfig(cfg.special_instructions);
    } catch { /* keep the empty config, as the result page does */ }
  }

  const data = buildDashboardData({
    ai_evaluation: session.ai_evaluation || {},
    cluster_config: clusterConfig,
    candidate: {
      name: session.candidate_name || 'Candidate',
      role: session.job_title || session.role || session.position || 'Candidate',
      email: session.candidate_email,
    },
    interview: {
      mode: interviewModeOf(session.special_instructions),
      completed_at: session.completed_at,
      created_at: session.created_at,
    },
    rounds_config: session.rounds_config,
    conversation_transcript: session.conversation_transcript,
    special_instructions: session.special_instructions,
  });

  // Identity photo for the report header — best-effort; the report still
  // builds without it (no photo on file, fetch blocked, unsupported type).
  let photoDataUrl: string | null = null;
  if (session.identity_photo_path) {
    try {
      const res = await api.get(`/ai-interview/${session.id}/identity-photo`, { responseType: 'blob' });
      photoDataUrl = await blobToDataUrl(res.data);
    } catch { /* no photo */ }
  }

  return exportEvalReportPDF(data, {
    evaluationId: session.display_id || null,
    sessionId: session.id,
    save,
    details: {
      candidateCid: session.candidate_cid || null,
      startedAt: session.started_at || null,
      completedAt: session.completed_at || null,
      identityVerified: !!session.identity_verified,
      // The results list's "Proctoring Risk" column — the PDF must match it.
      proctoringRisk: getProctoringRisk(session).level,
      photoDataUrl,
      violations: session.proctoring_violations ?? [],
      // Same route the results lists open for a candidate.
      resultUrl: session.config_id && typeof window !== 'undefined'
        ? `${window.location.origin}/recruitment/ai-interviews/${session.config_id}/results/details?session_id=${session.id}`
        : null,
    },
  });
}

const blobToDataUrl = (blob: Blob): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

/**
 * The toolbar's Download PDFs: every given row that has a report. One report
 * downloads as its PDF; several go into one zip, so the browser doesn't block
 * a burst of separate downloads. Built one at a time — each needs its full
 * session fetched — with `onProgress` for the button's "n / total" label.
 * A row that fails is skipped rather than sinking the rest.
 */
export async function downloadSessionReports(
  rows: any[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const withReport = rows.filter(canTryReport);
  const skipped = rows.length - withReport.length;
  if (withReport.length === 0) return { downloaded: 0, skipped, failed: 0 };

  if (withReport.length === 1) {
    onProgress?.(0, 1);
    try {
      await downloadSessionReport(withReport[0].id);
    } catch (err) {
      if (err instanceof NoReportError) return { downloaded: 0, skipped: skipped + 1, failed: 0 };
      throw err;
    }
    onProgress?.(1, 1);
    return { downloaded: 1, skipped, failed: 0 };
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  let failed = 0;
  let noReport = 0;
  for (let i = 0; i < withReport.length; i += 1) {
    onProgress?.(i, withReport.length);
    try {
      const { blob, fileName } = await downloadSessionReport(withReport[i].id, false);
      // Two candidates can share a name (and so a file name) — keep both.
      let name = fileName;
      for (let n = 2; used.has(name); n += 1) name = fileName.replace(/\.pdf$/, `_${n}.pdf`);
      used.add(name);
      if (blob) zip.file(name, blob);
    } catch (err) {
      if (err instanceof NoReportError) { noReport += 1; continue; }
      console.error('[downloadSessionReports] report failed for', withReport[i].id, err);
      failed += 1;
    }
  }
  onProgress?.(withReport.length, withReport.length);
  const downloaded = withReport.length - failed - noReport;
  if (downloaded > 0) {
    const archive = await zip.generateAsync({ type: 'blob' });
    aiInterviewService.triggerBlobDownload(archive, zipName);
  }
  return { downloaded, skipped: skipped + noReport, failed };
}
