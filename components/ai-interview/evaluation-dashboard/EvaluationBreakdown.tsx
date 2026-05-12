import { Calculator, TrendingUp } from 'lucide-react';
import type { Cluster, SectionWeights } from './types';

interface Props {
  mustHaveScore: number;
  niceToHaveScore: number;
  hrScore?: number;          // accepted but no longer rendered — HR is excluded from scoring
  finalScore: number;
  mustHaveClusters: Cluster[];
  niceToHaveClusters: Cluster[];
  weights: SectionWeights;   // dynamic weights (sum to 100 across present sections)
  sectionsPresent: { mustHave: boolean; niceToHave: boolean; hr: boolean };
}

/** Full Evaluation Breakdown — displayed math ALWAYS reconciles with the
 *  category and final scores (adapter computes those from the same sums shown here).
 *
 *  HR is excluded from scoring (review-only). Base canonical weights are 70/30
 *  (MTH/NTH); when a section is missing, its share is redistributed to the other. */
export function EvaluationBreakdown({
  mustHaveScore,
  niceToHaveScore,
  finalScore,
  mustHaveClusters,
  niceToHaveClusters,
  weights,
  sectionsPresent,
}: Props) {
  const wMth = weights.mustHave / 100;
  const wNth = weights.niceToHave / 100;
  const mthContribution = mustHaveScore * wMth;
  const nthContribution = niceToHaveScore * wNth;
  const weightedSum = mthContribution + nthContribution;
  const presentCount = [sectionsPresent.mustHave, sectionsPresent.niceToHave].filter(Boolean).length;

  // Per-cluster contributions (exactly what the category score is summed from).
  const mthItems = mustHaveClusters.map(c => ({
    name: c.name,
    priority: c.priority,
    score: c.clusterScore,
    weight: c.weight,
    contribution: (c.clusterScore * c.weight) / 100,
  }));
  const nthItems = niceToHaveClusters.map(c => ({
    name: c.name,
    priority: c.priority,
    score: c.clusterScore,
    weight: c.weight,
    contribution: (c.clusterScore * c.weight) / 100,
  }));
  const mthSum = mthItems.reduce((a, x) => a + x.contribution, 0);
  const nthSum = nthItems.reduce((a, x) => a + x.contribution, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Calculator size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Evaluation Breakdown</h2>
          <p className="text-sm text-gray-500">Detailed scoring methodology and calculations</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* STEP 1 — Skill Scoring */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">1</span>
            Skill Scoring (0–10 Scale)
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 pl-8">
            Each skill is evaluated on a 0–10 scale based on candidate responses, with AI-driven feedback providing context for the assessment.
          </p>
        </div>

        {/* STEP 2 — Cluster Score */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">2</span>
            Cluster Score Calculation
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 pl-8 mb-3">
            Skills within each cluster are averaged to produce a cluster score.
          </p>
          <div className="pl-8 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
            <code className="text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              Cluster Score = (Σ Skill Scores) / Number of Skills
            </code>
          </div>
        </div>

        {/* STEP 3 — Category Score */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">3</span>
            Category Score Calculation
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 pl-8 mb-3">
            Clusters within each category (Must-Have, Nice-to-Have) are weighted and combined to produce category scores.
          </p>

          <div className="pl-8 space-y-3">
            {/* Must-Have */}
            {mthItems.length > 0 && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-700 mb-2 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                  Must-Have Category
                </div>
                <div className="space-y-1 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                  {mthItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-emerald-900">
                      <span>{item.name} ({Math.round(item.score)} × {item.weight}%)</span>
                      <span>= {Math.round(item.contribution)}</span>
                    </div>
                  ))}
                  <div className="border-t border-emerald-300 pt-1 mt-1"></div>
                  <div className="flex justify-between text-emerald-900 font-bold">
                    <span>Must-Have Score</span>
                    <span>= {Math.round(mthSum)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Nice-to-Have */}
            {nthItems.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-700 mb-2 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                  Nice-to-Have Category
                </div>
                <div className="space-y-1 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                  {nthItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-amber-900">
                      <span>{item.name} ({Math.round(item.score)} × {item.weight}%)</span>
                      <span>= {Math.round(item.contribution)}</span>
                    </div>
                  ))}
                  <div className="border-t border-amber-300 pt-1 mt-1"></div>
                  <div className="flex justify-between text-amber-900 font-bold">
                    <span>Nice-to-Have Score</span>
                    <span>= {Math.round(nthSum)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STEP 4 — Final Score Weight Distribution */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">4</span>
            Final Score Weight Distribution
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 pl-8 mb-2">
            Canonical weights: <strong>MHS 70%, NHS 30%</strong> (HR is review-only, excluded from scoring). When a section is absent, its share is
            redistributed proportionally so the present sections sum to 100%.
          </p>
          {presentCount < 3 && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 ml-8 mb-3">
              This interview has <strong>{presentCount}</strong> of 3 sections — weights renormalized below.
            </p>
          )}
          <div className={`pl-8 grid gap-3 ${presentCount === 3 ? 'grid-cols-3' : presentCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {sectionsPresent.mustHave && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-700 mb-1 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>MUST-HAVE</div>
                <div className="text-xl text-emerald-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(weights.mustHave)}%</div>
                {presentCount < 2 && <div className="text-[10px] text-emerald-600 mt-1" style={{ fontFamily: 'var(--font-mono)' }}>base 70% → {Math.round(weights.mustHave)}%</div>}
              </div>
            )}
            {sectionsPresent.niceToHave && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-700 mb-1 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>NICE-TO-HAVE</div>
                <div className="text-xl text-amber-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(weights.niceToHave)}%</div>
                {presentCount < 2 && <div className="text-[10px] text-amber-600 mt-1" style={{ fontFamily: 'var(--font-mono)' }}>base 30% → {Math.round(weights.niceToHave)}%</div>}
              </div>
            )}
          </div>
          <details className="ml-8 mt-3 text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">How is this calculated?</summary>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/30 rounded border border-gray-200 dark:border-gray-700" style={{ fontFamily: 'var(--font-mono)' }}>
              <div className="mb-1">w_section = (base_section / Σ base_of_present_sections) × 100</div>
              <div className="text-[11px] text-gray-400 mt-2">Examples:</div>
              <div className="text-[11px]">• Both: MHS = 70%, NHS = 30%</div>
              <div className="text-[11px]">• MHS only: 100%</div>
              <div className="text-[11px]">• NHS only: 100%</div>
              <div className="text-[11px] text-gray-400 mt-1">HR section is review-only and excluded from scoring.</div>
            </div>
          </details>
        </div>

        {/* STEP 5 — Final Score Calculation */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">5</span>
            Final Score Calculation
          </h3>
          <div className="pl-8 space-y-3">
            <div className="p-5 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                Formula
              </div>
              <code className="text-sm block mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                Weighted Score = {[
                  sectionsPresent.mustHave   ? `(MHS × ${Math.round(wMth)})` : null,
                  sectionsPresent.niceToHave ? `(NHS × ${Math.round(wNth)})` : null,
                ].filter(Boolean).join(' + ')}
              </code>
              <code className="text-sm block" style={{ fontFamily: 'var(--font-mono)' }}>
                Final Score (0–100) = Weighted Score × 10
              </code>
            </div>

            <div className="p-5 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
              <div className="text-xs text-emerald-700 mb-3 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                Actual Calculation
              </div>
              <div className="space-y-2 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                {sectionsPresent.mustHave && (
                  <div className="flex justify-between text-emerald-900">
                    <span>({Math.round(mustHaveScore)} × {Math.round(wMth)})</span>
                    <span>= {Math.round(mthContribution)}</span>
                  </div>
                )}
                {sectionsPresent.niceToHave && (
                  <div className="flex justify-between text-emerald-900">
                    <span>({Math.round(niceToHaveScore)} × {Math.round(wNth)})</span>
                    <span>= {Math.round(nthContribution)}</span>
                  </div>
                )}
                <div className="border-t border-emerald-300 pt-2 mt-2"></div>
                <div className="flex justify-between text-emerald-900 font-semibold">
                  <span>Weighted Score</span>
                  <span>= {Math.round(weightedSum)}</span>
                </div>
                <div className="flex justify-between text-emerald-900 font-bold">
                  <span>× 10 (scale to 0–100)</span>
                  <span className="text-lg">= {Math.round(finalScore)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3">
        <TrendingUp size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-900">
          This weighted scoring approach ensures that critical skills have the most impact on the final evaluation, while still considering additional competencies. HR responses are reviewed separately and do not affect the final score.
        </p>
      </div>
    </div>
  );
}
