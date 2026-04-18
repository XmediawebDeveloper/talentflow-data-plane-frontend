'use client';

// Evaluation Dashboard — new 4-view design (Report / Analysis / Timeline / Table).
// Data comes from ai_evaluation + cluster config (special_instructions).
// Cluster Name + Priority are sourced from the config (authoritative).

import { Layers } from 'lucide-react';
import { EvaluationDashboard } from '../evaluation-dashboard/EvaluationDashboard';

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

export default function EvaluationDashboardTab({
  sessionId,
  aiEvaluation,
  isCompleted,
  clusterConfig,
  candidate,
  interview,
}: Props) {
  if (!isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Evaluation dashboard will be available after the interview completes.</p>
      </div>
    );
  }

  if (!aiEvaluation || Object.keys(aiEvaluation).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No evaluation data available yet.</p>
      </div>
    );
  }

  return (
    <EvaluationDashboard
      ai_evaluation={aiEvaluation}
      cluster_config={clusterConfig || { mth: [], nth: [] }}
      candidate={candidate || { name: 'Candidate', role: 'Candidate' }}
      interview={interview || {}}
    />
  );
}
