// Row-level "Download report" for the AI Interview results lists. Rebuilds
// the same DashboardData the candidate result page's Eval tab renders from,
// then hands it to the same PDF builder, so the file matches that page's
// "Download Report (PDF)" exactly. List rows are compact, so the full
// session (evaluation, transcript, special_instructions) is fetched first.
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { buildDashboardData } from './adapter';
import { exportEvalReportPDF } from './EvalReportCombined';

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

/** True when a list row has an evaluation report to download — scored, or a
 *  partial (terminated) evaluation. Mirrors when the result page's Eval tab
 *  has a report rather than a placeholder. */
export const hasEvaluationReport = (row: any): boolean => {
  if (!row?.ai_evaluation || row.status === 'in_progress') return false;
  const evaluation = row.ai_evaluation;
  if (evaluation.partial === true) return true;
  return row.status === 'completed';
};

export async function downloadSessionReport(sessionId: string, save = true) {
  const session: any = await aiInterviewService.get(sessionId);
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

  return exportEvalReportPDF(data, { evaluationId: session.display_id || null, sessionId: session.id, save });
}

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
  const withReport = rows.filter(hasEvaluationReport);
  const skipped = rows.length - withReport.length;
  if (withReport.length === 0) return { downloaded: 0, skipped, failed: 0 };

  if (withReport.length === 1) {
    onProgress?.(0, 1);
    await downloadSessionReport(withReport[0].id);
    onProgress?.(1, 1);
    return { downloaded: 1, skipped, failed: 0 };
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  let failed = 0;
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
      console.error('[downloadSessionReports] report failed for', withReport[i].id, err);
      failed += 1;
    }
  }
  onProgress?.(withReport.length, withReport.length);
  const downloaded = withReport.length - failed;
  if (downloaded > 0) {
    const archive = await zip.generateAsync({ type: 'blob' });
    aiInterviewService.triggerBlobDownload(archive, zipName);
  }
  return { downloaded, skipped, failed };
}
