import { useMemo } from 'react';
import { OverallSummary } from './OverallSummary';
import { AnalysisView } from './AnalysisView';
import { buildDashboardData } from './adapter';

interface ClusterConfigDef {
  id?: string;
  name: string;
  priority: number;
  skills: string[];
}

interface Props {
  ai_evaluation: any;
  cluster_config: { mth: ClusterConfigDef[]; nth: ClusterConfigDef[] };
  candidate: { name: string; role?: string; email?: string };
  interview: { mode?: string; completed_at?: string | null; created_at?: string };
}

/** Evaluation Dashboard — Analysis-only view.
 *
 *  Timeline and Table views were removed from this tab per product decision:
 *  - Timeline is available in the Transcript/Q&A tabs
 *  - Detailed Skills Table is now part of the Coverage tab
 *
 *  What remains: Overall Summary + full Analysis (cluster cards, radar chart,
 *  evaluation breakdown with formula & per-cluster math).
 */
export function EvaluationDashboard({ ai_evaluation, cluster_config, candidate, interview }: Props) {
  const data = useMemo(
    () => buildDashboardData({ ai_evaluation, cluster_config, candidate, interview }),
    [ai_evaluation, cluster_config, candidate, interview],
  );

  return (
    <div className="space-y-8">
      <OverallSummary
        finalScore={data.scores.final}
        mustHaveScore={data.scores.mustHave}
        niceToHaveScore={data.scores.niceToHave}
        hrScore={data.scores.hr}
      />

      <AnalysisView data={data} />
    </div>
  );
}
