'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// ── Types from WebSocket skill_coverage_update clusters array ──────────────
export interface SkillItem {
  skill: string;
  level: 'not_started' | 'covered' | 'medium' | 'low' | 'skipped' | 'not_covered_idk';
  is_hr: boolean;
  is_active?: boolean;       // Backend flags this skill as currently being asked
  question_number?: number;  // Question number at which this skill was/is asked
  is_follow_up?: boolean;    // Current/last question for this skill was a follow-up
}

export interface ClusterData {
  cluster_id: string;
  cluster_name: string;
  round_type: string;
  skills: SkillItem[];
  planned_questions: number;
  is_active: boolean;
  current_skill?: string;    // Name of the skill currently being asked in this cluster
}

interface SkillCoveragePanelProps {
  clusters: ClusterData[];
  totalQuestions: number;
  questionsAsked: number;
  currentQuestionNumber?: number | null;
  isFollowUp?: boolean;
}

// Unified display labels: High, Medium, Low, Not Covered
// Supports both new standardized labels and legacy internal levels for backward compat.
const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  // New standardized labels (backend sends these for new interviews)
  'High':          { label: 'High',        color: 'text-green-400',  bg: 'bg-green-950' },
  'Medium':        { label: 'Medium',      color: 'text-yellow-400', bg: 'bg-yellow-950' },
  'Low':           { label: 'Low',         color: 'text-orange-400', bg: 'bg-orange-950' },
  'Not Covered':   { label: 'Not Covered', color: 'text-gray-500',   bg: 'bg-gray-850'  },
  // Legacy internal levels (backward compat with older saved data)
  covered:         { label: 'High',        color: 'text-green-400',  bg: 'bg-green-950' },
  medium:          { label: 'Medium',      color: 'text-yellow-400', bg: 'bg-yellow-950' },
  low:             { label: 'Low',         color: 'text-orange-400', bg: 'bg-orange-950' },
  skipped:         { label: 'Not Covered', color: 'text-gray-500',   bg: 'bg-gray-850'  },
  not_covered_idk: { label: 'Low',         color: 'text-orange-400', bg: 'bg-orange-950' },
  not_started:     { label: 'Not Covered', color: 'text-gray-500',   bg: 'bg-gray-850'  },
};

function getRoundTypeLabel(round_type: string): string {
  switch (round_type) {
    case 'must_have_skills':    return 'Must-Have Skills';
    case 'nice_to_have_skills': return 'Nice-to-Have Skills';
    case 'hr':                  return 'HR / Cultural';
    default:                    return round_type.replace(/_/g, ' ');
  }
}

export default function SkillCoveragePanel({
  clusters,
  totalQuestions,
  questionsAsked,
  currentQuestionNumber,
  isFollowUp,
}: SkillCoveragePanelProps) {
  if (!clusters || clusters.length === 0) return null;

  const progressPct = totalQuestions > 0 ? Math.round((questionsAsked / totalQuestions) * 100) : 0;

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      {/* Progress */}
      <div>
        <div className="flex justify-between tf-body-muted mb-1">
          <span>Progress</span>
          <span>{questionsAsked}/{totalQuestions} questions</span>
        </div>
        <Progress value={progressPct} className="h-1.5" />
      </div>

      {/* Clusters */}
      <div className="space-y-4">
        {clusters.map((cluster) => {
          const coveredCount = cluster.skills.filter(
            (s) => s.level === 'covered' || s.level === 'medium'
          ).length;
          const totalSkills = cluster.skills.length;
          const isComplete = totalSkills > 0 && coveredCount === totalSkills;

          return (
            <div
              key={cluster.cluster_id}
              className={`rounded-md ${
                cluster.is_active ? 'ring-1 ring-blue-600 bg-blue-950/10 p-1' : ''
              }`}
            >
              {/* Cluster header */}
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5">
                  {cluster.is_active && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                  <span className="text-xs font-semibold text-gray-200">
                    {cluster.cluster_name || getRoundTypeLabel(cluster.round_type)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isComplete && (
                    <Badge variant="outline" className="text-xs border-green-700 text-green-400 py-0">
                      Done
                    </Badge>
                  )}
                  {cluster.is_active && !isComplete && (
                    <Badge variant="outline" className="text-xs border-blue-700 text-blue-400 py-0">
                      Active
                    </Badge>
                  )}
                  <span className="tf-meta">{coveredCount}/{totalSkills}</span>
                </div>
              </div>

              {/* Skill rows */}
              {cluster.skills.length > 0 ? (
                <div className="space-y-1">
                  {cluster.skills.map((item, i) => {
                    const isActiveSkill =
                      item.is_active === true ||
                      (cluster.current_skill != null && cluster.current_skill === item.skill);

                    const showFollowUp =
                      item.is_follow_up === true ||
                      (isActiveSkill && isFollowUp === true);

                    const cfg = LEVEL_CONFIG[item.level] ?? LEVEL_CONFIG.not_started;
                    const rowBg = isActiveSkill ? 'bg-blue-900/40' : cfg.bg;
                    const rowRing = isActiveSkill ? 'ring-1 ring-blue-500' : '';

                    const displayQNum =
                      item.question_number != null
                        ? item.question_number
                        : isActiveSkill && currentQuestionNumber != null
                        ? currentQuestionNumber
                        : null;

                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-2 py-1 rounded text-xs ${rowBg} ${rowRing}`}
                      >
                        {/* Left: pulse dot + skill name + follow-up tag */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isActiveSkill && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                          )}
                          <span className="text-gray-300 truncate min-w-0">{item.skill}</span>
                          {showFollowUp && (
                            <span className="shrink-0 text-2xs px-1 py-px rounded bg-amber-900/70 text-amber-400 font-semibold border border-amber-700/50">
                              Follow-up
                            </span>
                          )}
                        </div>

                        {/* Right: Q number + coverage level */}
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {displayQNum != null && (
                            <span className={`text-2xs font-mono font-semibold tabular-nums ${
                              isActiveSkill ? 'text-blue-400' : 'text-gray-500'
                            }`}>
                              Q{displayQNum}
                            </span>
                          )}
                          <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="tf-meta px-2 py-1 italic">No skills configured</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
