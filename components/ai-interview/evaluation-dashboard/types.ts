// Shared types for the evaluation dashboard design.
// Mapped from the backend's ai_evaluation JSON + cluster config in special_instructions.

export type Level = 'High' | 'Medium' | 'Low';
export type Recommendation = 'Strong Hire' | 'Hire' | 'Consider' | 'No Hire';

export interface Skill {
  name: string;
  score: number;        // 0-10 scale
  level: Level;
  feedback: string;     // per-skill note from evaluator
}

export interface Cluster {
  clusterNumber: number;
  name: string;         // cluster name from config
  priority: Level;      // cluster priority from config (High/Medium/Low)
  weight: number;       // 0-100 weight (how much this cluster contributes to its section)
  skills: Skill[];
  clusterScore: number; // 0-10 average
}

export interface InterviewResponse {
  id: number;
  timestamp: string;     // HH:MM:SS
  question: string;
  candidateResponse: string;
  skillsCovered: string[];
  duration: string;      // MM:SS
}

export interface SectionWeights {
  mustHave: number;   // 0-100, e.g. 70 when all 3 sections present; 77.78 when HR absent
  niceToHave: number;
  hr: number;
}

/** Per-question evaluation row driving the timed-mode doc-spec breakdown.
 *  One PerQuestionDetail per question asked. Skills are the multi-skill set
 *  assessed by that question; each carries its priority weight (10/7/4) and
 *  per-skill 0-10 score so the Σ(score × weight)/Σ(weights) math can be
 *  shown directly in the UI. */
export interface PerQuestionSkill {
  name: string;
  priority: Level;       // High / Medium / Low
  weight: number;        // 10 / 7 / 4
  score: number;         // 0-10
  note: string;          // short LLM rationale
}

export interface PerQuestionDetail {
  qNum: number;                          // 1-based display index (matches Q&A tab)
  section: 'mth' | 'nth' | 'hr';
  question: string;
  skills: PerQuestionSkill[];
  questionScore: number;                 // 0-10, weighted average
}

export interface DashboardData {
  candidate: { name: string; role: string; email?: string };
  interview: { mode: 'Timed' | 'Conversational'; duration: string; date: string };
  scores: {
    mustHave: number;    // 0-10
    niceToHave: number;  // 0-10
    hr: number;          // 0-10
    final: number;       // 0-100
  };
  /** Per-section weights (0-100) after renormalization for missing sections.
   *  Sections that are absent have weight 0. Present sections always sum to 100. */
  weights: SectionWeights;
  /** Which sections actually exist in this interview */
  sectionsPresent: { mustHave: boolean; niceToHave: boolean; hr: boolean };
  strengths: string[];
  weaknesses: string[];
  aiSummary: string;
  recommendation: Recommendation;
  mustHaveClusters: Cluster[];
  niceToHaveClusters: Cluster[];
  interviewResponses: InterviewResponse[];

  // ── Timed-mode doc-spec fields (simplified evaluation) ──────────────────
  /** Pass/Fail result driven by MHS section_question_avg ≥ mhsThreshold.
   *  null when MHS data unavailable (e.g. incomplete interview). */
  finalResult: 'Pass' | 'Fail' | null;
  /** Threshold used for the Pass/Fail gate (doc spec: 7.0 / 10). */
  mhsThreshold: number;
  /** Per-question weighted scores keyed by display q-num (1-based). */
  questionScores: Record<number, number>;
  /** Per-question detail rows for the timed-mode breakdown table. */
  perQuestionDetails: PerQuestionDetail[];
}
