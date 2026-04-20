'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Loader2, Layers } from 'lucide-react';
import { ReportView } from '../evaluation-dashboard/ReportView';
import { OverallSummary } from '../evaluation-dashboard/OverallSummary';
import { buildDashboardData } from '../evaluation-dashboard/adapter';
import { generateEvaluationPDF } from '../evaluation-dashboard/generatePDF';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

interface ClusterDef {
  id?: string;
  name: string;
  priority: number;
  skills: string[];
}

interface Props {
  sessionId: string;
  aiEvaluation: Record<string, any>;
  isCompleted: boolean;
  clusterConfig?: { mth: ClusterDef[]; nth: ClusterDef[] };
  candidate?: { name: string; role?: string; email?: string };
  interview?: { mode?: string; completed_at?: string | null; created_at?: string };
}

export default function EvaluationReportTab({
  sessionId,
  aiEvaluation,
  isCompleted,
  clusterConfig,
  candidate,
  interview,
}: Props) {
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | 'json' | null>(null);

  const data = useMemo(() => {
    if (!aiEvaluation || Object.keys(aiEvaluation).length === 0) return null;
    return buildDashboardData({
      ai_evaluation: aiEvaluation,
      cluster_config: clusterConfig || { mth: [], nth: [] },
      candidate: candidate || { name: 'Candidate', role: 'Candidate' },
      interview: interview || {},
    });
  }, [aiEvaluation, clusterConfig, candidate, interview]);

  const handleDownload = async (format: 'pdf' | 'excel' | 'json') => {
    setDownloading(format);
    try {
      if (format === 'pdf' && data) {
        // Client-side visual PDF (jsPDF + autotable). Violation Summary is
        // appended as the final section using proctoring_summary from the
        // backend's ai_evaluation.
        const proct = aiEvaluation?.proctoring_summary || {};
        const riskLevel = (proct.risk_level || 'Low') as 'Low' | 'Medium' | 'High';
        generateEvaluationPDF({
          candidate: { name: data.candidate.name, email: data.candidate.email, role: data.candidate.role },
          interview: { mode: data.interview.mode, duration: data.interview.duration, date: data.interview.date },
          scores: data.scores,
          mustHaveClusters: data.mustHaveClusters,
          niceToHaveClusters: data.niceToHaveClusters,
          strengths: data.strengths,
          weaknesses: data.weaknesses,
          recommendation: data.recommendation,
          aiSummary: data.aiSummary,
          proctoring: {
            riskLevel,
            totalViolations: Number(proct.total_violations ?? 0),
            highSeverityCount: Number(proct.high_severity_count ?? 0),
            autoTerminated: !!proct.auto_terminated,
          },
        });
      } else {
        const blob = await aiInterviewService.downloadReport(sessionId, 'evaluation', format);
        const ext = format === 'excel' ? 'xlsx' : format;
        const safeName = (candidate?.name || 'Candidate').replace(/[^a-z0-9]+/gi, '_');
        aiInterviewService.triggerBlobDownload(blob, `Evaluation_Report_${safeName}.${ext}`);
      }
    } catch {
      /* silent — surfacing handled by toast elsewhere */
    }
    setDownloading(null);
  };

  if (!isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Evaluation report will be available after the interview completes.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No evaluation data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Action bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Evaluation Report</h3>
            <p className="text-xs text-gray-500">Final candidate assessment · download as PDF, Excel, or JSON</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['pdf', 'excel', 'json'] as const).map(fmt => {
            const isLoading = downloading === fmt;
            const isPrimary = fmt === 'pdf';
            return (
              <button
                key={fmt}
                onClick={() => handleDownload(fmt)}
                disabled={downloading !== null}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  isPrimary
                    ? 'bg-gray-900 hover:bg-gray-800 text-white'
                    : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Overall summary (same hero as dashboard) ───────────────── */}
      <OverallSummary
        finalScore={data.scores.final}
        mustHaveScore={data.scores.mustHave}
        niceToHaveScore={data.scores.niceToHave}
        hrScore={data.scores.hr}
      />

      {/* ── Full report ────────────────────────────────────────────── */}
      <ReportView data={data} />
    </div>
  );
}
