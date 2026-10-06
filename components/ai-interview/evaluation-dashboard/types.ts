// Shared types for the evaluation dashboard design.
// Mapped from the backend's ai_evaluation JSON + cluster config in special_instructions.

export type Level = 'High' | 'Medium' | 'Low';
export type Recommendation = 'Strong Hire' | 'Hire' | 'Consider' | 'No Hire';

export interface Skill {
  name: string;
  score: number;        // 0-10 scale (candidate's demonstration depth)
  level: Level;
  feedback: string;     // per-skill note from evaluator
  /** True if this skill was probed by at least one interview question (from
   *  ai_evaluation.skill_assessed_map or question_history). Independent of
   *  score — a skill can be `asked: true` with score 0 ("asked but the
   *  candidate didn't demonstrate it"). The Cluster Coverage view uses this
   *  for its primary classification; `score`/`level` are the sub-detail. */
  asked: boolean;
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
  priority: Level | null; // High / Medium / Low; null = no priority (not scored)
  weight: number;        // 10 / 7 / 4; 0 when priority is null
  score: number;         // 0-10
  note: string;          // short LLM rationale
  /** True when `score` was derived from the question-level entry.score
   *  because no per-skill evaluator row was emitted for this skill. The
   *  UI should render a small "Q" indicator so reviewers know the score
   *  reflects the candidate's overall answer on that question, not a
   *  direct assessment of this specific skill. Set by the adapter when
   *  the planned skill has no matching evaluations[] row. */
  is_fallback?: boolean;
  /** True when the candidate didn't actually answer this question
   *  (skipped, timed out, "I don't know"). The Q-level fallback is
   *  suppressed for these so a misleading high score doesn't propagate
   *  to planned skills the candidate never demonstrated. UI should
   *  render a "Skipped" or "IDK" badge instead of the numeric score. */
  is_skipped?: boolean;
  /** True when NO evaluator score exists for this skill (no matching
   *  evaluations[] row, the candidate did answer, and there is no positive
   *  question-level fallback). Per the scoring spec the backend never
   *  fabricates a 0.0 for an unevaluated skill — it skips it. The frontend
   *  must do the same: unscored skills are EXCLUDED from the weighted
   *  question score and rendered as "Not evaluated" rather than a misleading
   *  0.0 that fails the candidate as if they said nothing. */
  is_unscored?: boolean;
  /** True when this skill belongs to an UN-ASKED (not delivered) question but
   *  still received a recovered score from another answer (or 0 if demonstrated
   *  nowhere). Lets the UI note the score came from recovery, not this (never
   *  asked) question. */
  not_delivered?: boolean;
}

/**
 * Build the per-question "Score Rationale" as an array of display lines,
 * derived ENTIRELY from the same `PerQuestionSkill[]` that the "Skills
 * assessed" card renders. This guarantees the Score Rationale and the
 * Skills-assessed table can NEVER show a different score for the same skill
 * (the recruiter's core requirement) — they are the same source.
 *
 * Each skill → `<name>: <score>/10 — <note>` (or `<name>: Not evaluated` when
 * unscored). Only the qualitative summary sentences of the backend rationale
 * (lines WITHOUT a `/10` score, e.g. "Overall: …") are appended; its per-skill
 * score lines are dropped and regenerated here so every number is single-
 * sourced. Used by EvaluationDashboardV2, EvaluationReportV2, and
 * EvalReportCombined (HTML + PDF) so all four surfaces are identical.
 */
export function buildRationaleLines(
  skills: PerQuestionSkill[],
  backendRationale?: string | null,
): string[] {
  const perSkill = (skills || []).map(s =>
    s.is_unscored
      ? `${s.name}: Not evaluated`
      : `${s.name}: ${Number(s.score).toFixed(1)}/10${s.note ? ` — ${s.note}` : ''}`
  );
  const summary = String(backendRationale || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/:\s*-?\d+(?:\.\d+)?\s*\/\s*10/.test(l));
  return [...perSkill, ...summary];
}

export interface PerQuestionClarification {
  /** 1-based CL index within the parent question (CL1, CL2, ...). */
  number: number;
  /** Bina's repeated/rephrased question text ("Let's stick to this
   *  question: …"). Mirrors what the Transcript tab labels "Clarify". */
  question: string;
  /** Candidate's response right after this clarification, if any. May be
   *  another clarification request or their (re)attempt at the answer. */
  answer: string;
}

export interface PerQuestionFollowUp {
  question: string;
  answer: string;
  /** LLM evaluator topic for this follow-up turn (if any). Helpful for the
   *  recruiter to see what the follow-up actually probed. */
  topic?: string;
  /** 0-10 score from the evaluator for this follow-up's response, if the
   *  pipeline emitted one. */
  score?: number;
  /** Short LLM rationale for the follow-up's score (one-line note). */
  note?: string;
  /** Why this follow-up fired. One of:
   *    - "validate_volunteered_primary": this slot's planned primary was
   *      already mentioned by the candidate in an earlier Q's answer
   *    - "probe_touched_secondary": this slot's planned secondary was
   *      already mentioned in an earlier Q's answer
   *    - "volunteered_skill": candidate volunteered a JD-relevant skill
   *      in this slot's main answer
   *  The Question Analysis tab uses this to render a friendly
   *  explanation note like "This follow-up was asked because the
   *  candidate mentioned this skill in Q1's answer." */
  reason?: string;
  /** Specific skill the follow-up targeted (focus_aspect). Falls back to
   *  topic when missing. */
  focus_skill?: string;
  /** When > 0, the question number where the candidate first volunteered
   *  the focus_skill. Used in the explanation note to point the
   *  recruiter at the right earlier answer. */
  source_qnum?: number;
}

export interface PerQuestionDetail {
  qNum: number;                          // 1-based display index (matches Q&A tab)
  section: 'mth' | 'nth' | 'hr';
  question: string;
  /** Candidate's transcribed response (ASR-corrected when available).
   *  Empty string when the candidate didn't answer (skipped / timed out / idk).
   *  Reviewers need this on the Question Analysis page to validate the AI-
   *  assigned score — without it, the score is a black box. */
  answer: string;
  /** Backend response type for this turn: 'answered' | 'skipped' |
   *  'not_answered' | 'idk' | 'timeout' | 'low_coverage' | ''.
   *  Drives the "Skipped" vs "Not Answered" label distinction. */
  responseType?: string;
  /** Source of a skip/advance: 'candidate' = the candidate pressed the Skip
   *  button (→ "Skipped"); anything else ('silence_skip' / 'timer_expired' /
   *  'auto_*' / '') = no reply was given (→ "Not Answered"). */
  skipSource?: string;
  skills: PerQuestionSkill[];
  questionScore: number;                 // 0-10, weighted average
  /** True when EVERY skill on this question is unscored (no evaluator rows
   *  and no question-level score). Such a question is "Not evaluated" and is
   *  EXCLUDED from the section average — counting it as 0.0 would unfairly
   *  tank the section. Mirrors the backend's "never fabricate a 0.0" rule. */
  isUnscored?: boolean;
  /** True when this planned question was NEVER ASKED — the candidate ended the
   *  interview before reaching it (backend response_type 'not_asked'). The
   *  question is still shown (recruiters see all planned slots) and its skills
   *  are still scored by whole-interview recovery: a skill the candidate
   *  demonstrated in another answer keeps that recovered score, otherwise 0.
   *  It STILL counts toward the section denominator (÷planned) — un-reached
   *  questions with no recovered evidence contribute 0. Drives a "Not Delivered"
   *  badge across all tabs / the PDF instead of a misleading "Skipped"/score. */
  notDelivered?: boolean;
  /** Display-only score for terminated / disconnect sessions. Derived from the
   *  live runtime evaluator snapshot when the full post-interview evaluation
   *  never landed. Shown on the question card, but EXCLUDED from section /
   *  overall aggregates so the UI does not fabricate a final result. */
  displayOnlyQuestionScore?: number;
  /** Follow-up Q&As that fired within this main question's slot. Each
   *  follow-up shares the parent's `qNum`. Empty/undefined when the
   *  candidate answered the main question well enough not to warrant
   *  one (or when timed-mode strict distribution suppresses probes).
   *  Surfaced under the main card so reviewers can verify whether
   *  Bina actually probed deeper. */
  followUps?: PerQuestionFollowUp[];
  /** Clarification turns ("Clarify"/CL1, CL2…) that fired within this
   *  question's slot — when the candidate asked Bina to repeat/rephrase and
   *  she replied "Let's stick to this question: …". Derived (adapter) from the
   *  raw conversation_transcript so the Question Analysis tab surfaces them the
   *  same way the Transcript tab does. Empty/undefined when none occurred. */
  clarifications?: PerQuestionClarification[];
  /** Set when this slot ITSELF was reframed as a follow-up (Option A,
   *  bundled): the candidate volunteered a P2/P3 planned skill in an
   *  earlier answer, so the slot's single main question doubled as a
   *  follow-up rather than firing a separate turn. Drives an inline
   *  "Reframed as follow-up — volunteered X in QN" note on the main card.
   *  Distinct from `followUps` (separate sub-question turns). */
  bundledFollowUp?: {
    reason?: string;
    focus_skill?: string;
    source_qnum?: number;
    /** Coverage band of the focus skill at slot-decision time ("low" /
     *  "medium"). Shown in the inline note so the reviewer can see WHY the
     *  slot probed rather than auto-skipping (covered) or asking fresh
     *  (not_started). Optional — older interviews lack this field. */
    prior_level?: string;
    /** Short excerpt (~80 chars) from the earlier answer that volunteered
     *  the focus skill, with the skill term in context. Lets the reviewer
     *  verify the volunteering at a glance without scrolling back. */
    source_excerpt?: string;
  };
  /** When this question got NO real answer, HOW it was skipped — candidate
   *  pressed "Next Question" vs went silent ("Are you there?") vs timed out.
   *  Derived (adapter, via buildSkipReasoner) from the raw conversation
   *  transcript + skip_source. Undefined when the question was answered.
   *  Rendered in the Question Analysis answer block; mirrors the Transcript
   *  tab so the two views agree. */
  skipReason?: { text: string; tone: 'amber' | 'gray' };
  /** Deterministic per-question explanation of WHY this score was awarded —
   *  what the candidate demonstrated, what was missing/weak, and the overall
   *  reason for the band. Composed backend-side from the per-skill evidence
   *  notes (no LLM). Empty for HR / review-only turns (never scored). Rendered
   *  under the Candidate's Answer block on the Question Analysis tab. */
  scoreRationale?: string;
}

export interface DashboardData {
  candidate: { name: string; role: string; email?: string };
  interview: { mode: 'Timed' | 'Conversational'; duration: string; date: string };
  /** True when the interview ended early (terminated / disconnect) and the
   *  dashboard should suppress final hiring outcome messaging. */
  isPartialEvaluation: boolean;
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
  /** Questions the candidate actually answered (response_type 'answered').
   *  NOT interviewResponses.length — that includes `not_asked` padding rows
   *  and skipped / unanswered slots, so it over-reported (e.g. "12 answered"
   *  for an interview where a single question was delivered). */
  questionsAnswered: number;
  /** Questions actually delivered to the candidate (answered, skipped or
   *  unanswered — but never `not_asked` / coverage-bypassed padding). */
  questionsAsked: number;

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
  /** Planned question count per section (from rounds_config.planned_questions).
   *  Used as the denominator for Section Score per spec:
   *    Section Score = sum(delivered q-scores) / planned_count
   *  with skipped/undelivered slots contributing 0. Falls back to the
   *  delivered count in the calculation display when the planned count
   *  isn't available (older interviews). */
  plannedCounts: { mustHave: number; niceToHave: number };
}
