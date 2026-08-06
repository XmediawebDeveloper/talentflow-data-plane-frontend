// Adapter: transforms the backend's ai_evaluation + session config
// into the dashboard design's DashboardData shape.
//
// Cluster Name + Priority come DIRECTLY from the special_instructions config,
// not from the evaluator's output — that's the authoritative source.

import type {
  DashboardData, Cluster, Skill, Level, Recommendation, InterviewResponse,
  PerQuestionDetail, PerQuestionSkill, PerQuestionFollowUp,
} from './types';
import { buildSkipReasoner, buildClarificationsByQuestion } from './skipReason';

interface ClusterConfigDef {
  id?: string;
  name: string;
  priority: number;     // 3=High, 2=Medium, 1=Low
  skills: string[];
  reason?: string;
}

interface ClusterConfig {
  mth: ClusterConfigDef[];
  nth: ClusterConfigDef[];
}

function scoreToLevel(score: number): Level {
  if (score >= 7) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}

// Shared client-side alias table. Used by both the Coverage lookup
// (`lookupAsked`) and the per-question skill-attribution scan. Keys are
// lowercased substrings that may appear inside JD skill names; values are
// alternate tokens that may appear in the actual question text.
const SKILL_ALIASES: Record<string, string[]> = {
  'git':            ['git', 'github', 'gitlab', 'bitbucket', 'version control'],
  'version control': ['git', 'github', 'gitlab', 'bitbucket', 'vcs', 'version control'],
  'aws':            ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  'azure':          ['azure', 'microsoft azure'],
  'gcp':            ['gcp', 'google cloud'],
  'cloud':          ['cloud', 'aws', 'azure', 'gcp'],
  'docker':         ['docker', 'container'],
  'kubernetes':     ['kubernetes', 'k8s'],
  'python':         ['python'],
  'java':           ['java', 'jvm'],
  'spring':         ['spring', 'spring boot', 'spring framework'],
  'tensorflow':     ['tensorflow', 'tf'],
  'pytorch':        ['pytorch', 'torch'],
  'natural language': ['nlp', 'natural language', 'transformer', 'language model'],
  'machine learning': ['machine learning', 'ml', 'regression', 'classifier', 'model training'],
  'deep learning':  ['deep learning', 'neural network', 'cnn', 'rnn', 'transformer'],
  'kafka':          ['kafka'],
  'rabbitmq':       ['rabbitmq', 'rabbit mq'],
  'redis':          ['redis'],
  'mongodb':        ['mongodb', 'mongo'],
  'postgresql':     ['postgresql', 'postgres', 'psql'],
  'oracle':         ['oracle'],
  'mysql':          ['mysql', 'mariadb'],
  'prometheus':     ['prometheus'],
  'grafana':        ['grafana'],
  'splunk':         ['splunk'],
  'jwt':            ['jwt', 'json web token'],
  'elk':            ['elk', 'elasticsearch', 'logstash', 'kibana'],
  'terraform':      ['terraform', 'iac', 'infrastructure as code'],
  'restful':        ['rest', 'restful', 'rest api'],
  'reactive':       ['reactive programming', 'reactive', 'rxjs'],
  'serverless':     ['serverless', 'lambda function', 'aws lambda'],
  'genai':          ['genai', 'generative ai', 'llm', 'chatgpt'],
  'sso':            ['sso', 'single sign-on', 'single sign on'],
  'single sign':    ['sso', 'single sign-on', 'single sign on'],
  'design pattern': ['design pattern', 'design patterns'],
  'microservice':   ['microservice', 'microservices'],
  'hazelcast':      ['hazelcast'],
  'ai platforms':   ['ai platforms', 'ai platform', 'modern ai'],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryTest(kw: string, blob: string): boolean {
  if (!kw || !blob) return false;
  const esc = escapeRegex(kw);
  const startsWithWord = /^\w/.test(kw);
  const endsWithWord = /\w$/.test(kw);
  const pattern = startsWithWord && endsWithWord
    ? new RegExp(`\\b${esc}\\b`)
    : new RegExp(esc);
  return pattern.test(blob);
}

/** Search keywords for a JD skill name: its comma components plus any
 *  SKILL_ALIASES entry whose key appears as a substring of the skill name.
 *  Example: "Familiarity with version control systems like Git" picks up
 *  the 'git' and 'version control' alias lists. */
function keywordsForSkill(skillName: string): string[] {
  const sl = skillName.toLowerCase();
  const out = new Set<string>();
  for (const c of sl.split(',').map(c => c.trim()).filter(Boolean)) out.add(c);
  for (const [aliasKey, aliasList] of Object.entries(SKILL_ALIASES)) {
    if (sl.includes(aliasKey)) for (const a of aliasList) out.add(a);
  }
  return [...out];
}

// Words that carry no real signal in a skill name — dropping them lets
// us match arbitrary JD names (technical OR non-technical) on the
// meaningful tokens. "Stakeholder management" → ["stakeholder",
// "management"]; "Understanding of neural network architectures" →
// ["neural", "network", "architectures"]; "Lead generation and CRM" →
// ["lead", "generation", "crm"].
const SKILL_STOPWORDS = new Set([
  // articles / prepositions / conjunctions
  'a', 'an', 'and', 'or', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'be', 'been', 'being', 'into',
  // generic skill-name framing words that appear in many JD entries
  'understanding', 'familiarity', 'experience', 'knowledge', 'proficiency',
  'expertise', 'ability', 'skilled', 'skill', 'skills', 'mastery',
  'capable', 'capacity', 'awareness', 'fluency', 'practice', 'working',
  'demonstrated', 'strong', 'good', 'basic',
  // generic connectives
  'such', 'like', 'including', 'etc', 'various', 'multiple', 'related',
  'using', 'use', 'used', 'use-case', 'use-cases', 'usage',
]);

/** Tokenize a skill name into significant words (lowercased, stopword-
 *  filtered, ≥2 chars). Punctuation is normalized to spaces. */
function tokenizeSkillName(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^\w\s/+#-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !SKILL_STOPWORDS.has(t));
}

/** Return the JD skill names whose evidence appears in `text`.
 *
 *  Matching strategies (any one is enough), in order:
 *   1. Alias-table hit — for known abbreviations / synonyms (k8s ↔
 *      kubernetes, jwt ↔ json web token, etc).
 *   2. Significant-bigram match — distinctive 2-word phrases derived
 *      from the skill name itself, e.g. "stakeholder management",
 *      "lead generation", "neural network". Bigrams are the sweet
 *      spot: specific enough to avoid false positives on common
 *      single words like "management" or "strategy", general enough
 *      to work without a hand-curated alias for every domain.
 *   3. Two-or-more-token match — for skills with multiple significant
 *      tokens that don't form an adjacent bigram in the text, require
 *      at least two of them to appear independently (e.g. "Talent
 *      acquisition strategy" matches "we acquire talent through ...
 *      strategic ..." because two tokens hit).
 *   4. Single significant token — only when the JD skill reduces to
 *      exactly one significant token AND it's distinctive enough
 *      (≥4 chars, since 3-letter tokens like "ai"/"ml"/"hr" are
 *      either covered by the alias table or too noisy to single-match).
 *
 *  This means the matcher is **content-agnostic**: it works for any
 *  role — software, sales, HR, finance, design, ops — without any
 *  per-domain configuration. The alias table only adds value for
 *  *abbreviations* and *synonyms* the bigram fallback can't catch.
 */
function findSkillsInText(text: string, jdSkillNames: string[]): string[] {
  const blob = text.toLowerCase();
  if (!blob) return [];
  const found: string[] = [];
  const seenLower = new Set<string>();
  for (const skill of jdSkillNames) {
    const sl = skill.toLowerCase();
    if (seenLower.has(sl)) continue;

    // 1) Alias-table hit (covers abbreviations / well-known synonyms).
    let matched = false;
    for (const kw of keywordsForSkill(skill)) {
      if (wordBoundaryTest(kw, blob)) { matched = true; break; }
    }

    // 2-4) Token-derived fallbacks — work for any skill name without
    // per-domain configuration.
    if (!matched) {
      const tokens = tokenizeSkillName(sl);
      if (tokens.length >= 2) {
        // 2) Bigram match.
        for (let i = 0; i < tokens.length - 1; i++) {
          const bg = `${tokens[i]} ${tokens[i + 1]}`;
          if (wordBoundaryTest(bg, blob)) { matched = true; break; }
        }
        // 3) ≥2-token independent match (stricter than 1 to avoid noise).
        if (!matched) {
          let hits = 0;
          for (const t of tokens) {
            if (wordBoundaryTest(t, blob)) {
              hits += 1;
              if (hits >= 2) { matched = true; break; }
            }
          }
        }
      } else if (tokens.length === 1) {
        // 4) Single distinctive token (≥4 chars; short tokens like
        // "ai"/"ml"/"hr" are handled by the alias table).
        const t = tokens[0];
        if (t.length >= 4 && wordBoundaryTest(t, blob)) matched = true;
      }
    }

    if (matched) {
      found.push(skill);
      seenLower.add(sl);
    }
  }
  return found;
}

function priorityNumToLevel(p: number): Level {
  if (p >= 3) return 'High';
  if (p === 2) return 'Medium';
  return 'Low';
}

function recommendationFromString(raw: any, finalScore: number): Recommendation {
  const s = (raw ?? '').toString().toUpperCase().trim();
  if (s === 'STRONG_YES' || s === 'STRONG HIRE') return 'Strong Hire';
  if (s === 'YES' || s === 'HIRE') return 'Hire';
  if (s === 'MAYBE' || s === 'CONSIDER') return 'Consider';
  if (s === 'NO' || s === 'NO HIRE' || s === 'NO_HIRE') return 'No Hire';
  // Fallback inferred from final score
  if (finalScore >= 80) return 'Strong Hire';
  if (finalScore >= 65) return 'Hire';
  if (finalScore >= 50) return 'Consider';
  return 'No Hire';
}

/** Case-insensitive + token-overlap + typo-tolerant skill lookup. */
function lookupSkillScore(skill: string, scoreMap: Record<string, number>): number {
  const sl = skill.toLowerCase().trim();
  const entries = Object.entries(scoreMap).map(([k, v]) => [k.toLowerCase().trim(), v] as const);
  // 1. exact
  for (const [k, v] of entries) if (k === sl) return Number(v) || 0;
  // 2. substring
  for (const [k, v] of entries) if (k.includes(sl) || sl.includes(k)) return Number(v) || 0;
  // 3. token overlap
  const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
  if (slTokens.size > 0) {
    for (const [k, v] of entries) {
      const ks = new Set(k.split(/[\s(),]+/).filter(t => t.length > 2));
      for (const t of slTokens) if (ks.has(t)) return Number(v) || 0;
    }
  }
  return 0;
}

/** Find the evaluator note (highest-scoring match for this skill). */
function lookupFeedback(skill: string, evaluations: any[]): string {
  const sl = skill.toLowerCase().trim();
  const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
  let best = { score: -1, note: '' };
  for (const ev of evaluations || []) {
    const topic = (ev?.evaluation?.topic || ev?.topic || '').toLowerCase().trim();
    if (!topic) continue;
    let matched = topic === sl || topic.includes(sl) || sl.includes(topic);
    if (!matched && slTokens.size > 0) {
      const ks = new Set(topic.split(/[\s(),]+/).filter((t: string) => t.length > 2));
      for (const t of slTokens) if (ks.has(t)) { matched = true; break; }
    }
    if (matched) {
      const sc = ev?.evaluation?.overall ?? ev?.score ?? 0;
      const note = ev?.evaluation?.brief_note || ev?.one_line_note || '';
      if (typeof sc === 'number' && sc > best.score) best = { score: sc, note };
    }
  }
  return best.note;
}

/** Distribute weights proportionally so they sum to exactly 100.
 * Uses largest-remainder method to absorb rounding error on the top cluster. */
function computeWeights(clusters: ClusterConfigDef[]): number[] {
  if (clusters.length === 0) return [];
  const totalPriority = clusters.reduce((sum, c) => sum + (c.priority || 1), 0) || 1;
  const raw = clusters.map(c => ((c.priority || 1) / totalPriority) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  // Distribute leftover 1s to the entries with the largest fractional parts
  const fractions = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (const { i } of fractions) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder--;
  }
  return out;
}

/** Build cluster data from config (authoritative) + scores from ai_evaluation. */
function buildClustersFromConfig(
  configClusters: ClusterConfigDef[],
  eval_: any,
  startingNumber: number,
): Cluster[] {
  const skillScoresMap = (eval_?.skill_scores_map || {}) as Record<string, number>;
  const evaluations = eval_?.evaluations || [];
  const clusterInsights = eval_?.cluster_insights || [];
  // ── Assessment Coverage: was each skill probed by a delivered question? ──
  // Priority order:
  //   1. ai_evaluation.skill_assessed_map (server-side authoritative map,
  //      built from question_history.assigned_skills + question text).
  //   2. question_history[i].assigned_skills — the at-ask-time planner
  //      snapshot (primary + planned secondaries) for each delivered slot.
  //      This is the "Question Distribution" source — every skill the slot
  //      was meant to probe gets credit, even if the question text only
  //      named one of them explicitly.
  //   3. Question-text scan across evaluations[].question — fallback for
  //      legacy interviews where assigned_skills wasn't persisted (the
  //      transcript_evaluation_service used to drop it in _build_question_
  //      history). Catches skill mentions inside multi-skill questions
  //      ("How do you balance IDS/IPS, VLAN, STP, RSTP, MSTP, and Zero
  //      Trust?") that the LLM only tagged with a single topic.
  const assessedMap = (eval_?.skill_assessed_map || {}) as Record<string, boolean>;
  const hasAssessedMap = Object.keys(assessedMap).length > 0;
  const questionHistory = (eval_?.question_history || []) as any[];

  // Collect every skill named in any question_history[].assigned_skills.
  // Only counts as "available" when at least one entry actually has a
  // non-empty list (older interviews stored []/null).
  const assignedSkillSet = new Set<string>();
  for (const q of questionHistory) {
    const a = q?.assigned_skills;
    if (Array.isArray(a)) {
      for (const s of a) {
        if (typeof s === 'string' && s.trim()) assignedSkillSet.add(s.toLowerCase());
      }
    }
  }
  const hasAssignedSnapshot = assignedSkillSet.size > 0;

  // Always build the question-text blob — it's now used as a fallback
  // alongside the authoritative sources (not exclusively), so older
  // sessions whose stored skill_assessed_map was built before the
  // backend's _SKILL_ALIASES caught git/aws/azure/etc. can still surface
  // those skills as Covered when the question text plainly probed them.
  const questionBlob = (evaluations as any[])
    .map(e => (e?.question || ''))
    .join(' ')
    .toLowerCase();

  const lookupAsked = (sname: string, score010: number): boolean => {
    const sl = sname.toLowerCase();

    // A skill is "asked" only when an AUTHORITATIVE source says a delivered
    // question probed it: the backend skill_assessed_map, the at-ask-time
    // assigned_skills snapshot, or the skill named in a question's text.
    //
    // We deliberately do NOT treat "score > 0" as proof of being asked when an
    // authoritative map exists. A score can leak ACROSS SECTIONS — e.g. the
    // candidate names an NHS skill ("Kubernetes", "Azure DevOps") while
    // answering an MHS question, so that NHS skill gets a score even though NO
    // NHS question was ever asked. Trusting score>0 then marked it "covered"
    // (BUG12). score>0 remains a fallback ONLY for legacy sessions that
    // persisted neither the assessed map nor the assigned-skills snapshot.
    if (hasAssessedMap) {
      for (const k of Object.keys(assessedMap)) {
        if (k.toLowerCase() === sl && assessedMap[k]) return true;
      }
    }
    if (assignedSkillSet.has(sl)) return true;

    if (questionBlob) {
      for (const kw of keywordsForSkill(sname)) {
        if (wordBoundaryTest(kw, questionBlob)) return true;
      }
    }

    // Legacy fallback: no authoritative signal at all → a positive score is the
    // only evidence the skill was probed.
    if (!hasAssessedMap && !hasAssignedSnapshot && score010 > 0) return true;
    return false;
  };

  // Weights always sum to exactly 100 so displayed math is consistent
  const weights = computeWeights(configClusters);

  // Phantom-skill filter: cluster definitions in special_instructions.mth_clusters /
  // nth_clusters often contain MORE skills than the question distribution plan
  // actually assigns. Those extras (e.g. "Safety-critical engineering",
  // "MBSE (Model-Based Systems Engineering)", "IBM DOORS / DOORS Next") inflate
  // the cluster denominator ("19/22 covered" instead of "19/19") and surface
  // synthetic-looking 0.3/1.0 fallback scores for skills no one was asked.
  //
  // Keep a cluster skill ONLY if at least one signal says it was part of the
  // plan or genuinely covered:
  //   • appears in any question_history[].assigned_skills (planner snapshot)
  //   • has a real per-skill score > 0 (either skill_scores_map or cluster_insights)
  //   • was flagged by the backend's skill_assessed_map
  //
  // When NONE of those signals exist for ANY skill in the cluster (legacy
  // interviews with no assigned snapshot, no scores, no assessed map), fall
  // back to the full list so we don't strip an entire cluster.
  // For a PARTIAL / terminated interview (cut short by a proctoring
  // termination or abandonment) the plan was only partly delivered. Collapsing
  // the denominator to "just the probed skills" then makes a single asked slot
  // render as 100% coverage — misleading. So for partial evals we keep the FULL
  // configured cluster, so coverage honestly reflects how little of the plan was
  // reached (e.g. 1 of 6 skills). Normal completed interviews are unchanged.
  // "Ended early" = the candidate did NOT reach every planned question (manually
  // clicked End Interview, or ran out of time) — even though the interview
  // COMPLETED normally (candidate_ended → not `partial`). In that case the plan
  // was only partly delivered, so — exactly like a partial/terminated eval — we
  // must keep the FULL configured cluster. Otherwise culling to "just the probed
  // skills" makes a 4-of-15-question interview read as "4/4 · 100% covered",
  // hiding every un-asked skill (BUG12). Detected from round_tracking:
  // sum(actual_questions_asked) < sum(planned_questions).
  const _rtracking = (eval_?.round_tracking || []) as any[];
  const _plannedQ = _rtracking.reduce((n, r) => n + (Number(r?.planned_questions) || 0), 0);
  const _actualQ = _rtracking.reduce((n, r) => n + (Number(r?.actual_questions_asked) || 0), 0);
  // Secondary signal: any question_history row marked as never-asked padding
  // means the plan wasn't fully delivered.
  const _hasUndelivered = ((eval_?.question_history || []) as any[]).some(
    q => ['not_asked', 'not_delivered', 'unasked'].includes(String(q?.response_type || '').toLowerCase()),
  );
  // Require _actualQ > 0 on the count-based signal so a re-eval that lost the
  // runtime `actual_questions_asked` (0) doesn't falsely flag a COMPLETED
  // interview as ended-early. `_hasUndelivered` covers the padding case.
  const endedEarly = (_plannedQ > 0 && _actualQ > 0 && _actualQ < _plannedQ) || _hasUndelivered;
  const isPartialEval = eval_?.partial === true || eval_?.evaluation_incomplete === true || endedEarly;
  const filterToPlanned = (hasAssignedSnapshot || hasAssessedMap) && !isPartialEval;
  return configClusters.map((cc, idx): Cluster => {
    const weight = weights[idx];

    const allSkillsForCluster = (cc.skills || []) as string[];
    const culledSkills = filterToPlanned
      ? allSkillsForCluster.filter(sname => {
          const sl = sname.toLowerCase().trim();
          if (assignedSkillSet.has(sl)) return true;
          if (lookupSkillScore(sname, skillScoresMap) > 0) return true;
          if (hasAssessedMap) {
            for (const k of Object.keys(assessedMap)) {
              if (k.toLowerCase() === sl && assessedMap[k]) return true;
            }
          }
          return false;
        })
      : allSkillsForCluster;
    // Safety net: if filtering wiped the whole cluster (every skill is a
    // phantom — unlikely but possible if the planner skipped a cluster
    // entirely), keep the original list so the cluster card doesn't vanish.
    const renderSkills = culledSkills.length > 0 ? culledSkills : allSkillsForCluster;

    const skills: Skill[] = renderSkills.map((sname): Skill => {
      // Prefer skill_scores_map (0-10); fall back to lookup in cluster_insights
      let score010 = lookupSkillScore(sname, skillScoresMap);
      if (score010 === 0) {
        // Try cluster_insights skill_scores (score is 0-100 there)
        for (const ci of clusterInsights) {
          for (const s of (ci.skill_scores || [])) {
            if ((s.skill || '').toLowerCase() === sname.toLowerCase()) {
              score010 = (Number(s.score) || 0) / 10;
              break;
            }
          }
        }
      }
      return {
        name: sname,
        score: Math.round(score010 * 10) / 10,
        level: scoreToLevel(score010),
        feedback: lookupFeedback(sname, evaluations) || 'No specific feedback captured for this skill.',
        asked: lookupAsked(sname, score010),
      };
    });

    // Cluster score = average of skill scores
    const scored = skills.filter(s => s.score > 0);
    const clusterScore = scored.length > 0
      ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 100) / 100
      : 0;

    return {
      clusterNumber: startingNumber + idx,
      name: cc.name,                          // CLUSTER NAME FROM CONFIG
      priority: priorityNumToLevel(cc.priority), // CLUSTER PRIORITY FROM CONFIG
      weight,
      skills,
      clusterScore,
    };
  });
}

/** Extract HR score from ai_evaluation.section_scores.hr (0-100 → 0-10). */
function hrScoreFromEval(eval_: any): number {
  const hr = eval_?.section_scores?.hr?.score;
  if (typeof hr === 'number' && hr > 0) return Math.round(hr) / 10;
  return 0;
}

/** Build interview response timeline from question_groups (preferred) or question_history. */
function buildInterviewResponses(eval_: any): InterviewResponse[] {
  const groups = eval_?.question_groups || [];
  if (groups.length > 0) {
    // Flatten: each main question becomes one response, follow-ups stay within
    const out: InterviewResponse[] = [];
    let id = 1;
    for (const g of groups) {
      const skills: string[] = [g.skill].filter(Boolean);
      const duration = g.duration_seconds ? formatMinSec(g.duration_seconds) : '—';
      const ts = g.timestamp ? formatTimestamp(g.timestamp) : `Q${id}`;
      out.push({
        id: id++,
        timestamp: ts,
        question: g.question || '',
        candidateResponse: g.answer || '',
        skillsCovered: skills,
        duration,
      });
      for (const fu of (g.follow_ups || [])) {
        out.push({
          id: id++,
          timestamp: fu.timestamp ? formatTimestamp(fu.timestamp) : `Q${id-1}f`,
          question: `↳ ${fu.question || ''}`,
          candidateResponse: fu.answer || '',
          skillsCovered: skills,
          duration: fu.duration_seconds ? formatMinSec(fu.duration_seconds) : '—',
        });
      }
    }
    return out;
  }

  // Fallback to question_history. `duration_seconds` is preserved on each
  // history row by transcript_evaluation_service._build_question_history
  // (preservation block at ~line 422) — pull it through so the Question
  // Analysis page actually shows per-Q timings instead of "—" everywhere.
  const history = eval_?.question_history || [];
  return history.map((h: any, idx: number): InterviewResponse => {
    const ds = Number(h?.duration_seconds);
    return {
      id: idx + 1,
      timestamp: h.timestamp ? formatTimestamp(h.timestamp) : `Q${idx + 1}`,
      question: h.question_text || h.question || '',
      candidateResponse: h.response_text || h.answer || '',
      skillsCovered: [h.topic].filter(Boolean),
      duration: Number.isFinite(ds) && ds > 0 ? formatMinSec(ds) : '—',
    };
  });
}

function formatTimestamp(raw: string): string {
  try {
    // Extract HH:MM:SS from ISO
    const t = new Date(raw);
    return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return raw; }
}

function formatMinSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Doc-spec priority → weight (10/7/4). Used by per-question breakdown table.
const PRIORITY_WEIGHT: Record<Level, number> = { High: 10, Medium: 7, Low: 4 };

function priorityLabelToLevel(raw: any): Level {
  const s = String(raw || '').toLowerCase();
  if (s === 'high') return 'High';
  if (s === 'low') return 'Low';
  return 'Medium';
}

/** Build per-question detail rows for the timed-mode evaluation breakdown.
 *
 *  Backend already emits:
 *    - `skill_question_map`: { skill → [{ q_num, score, note }] } keyed by display q-num
 *    - `question_scores`: { q_num → 0-10 weighted score }
 *    - `skill_priority_map`: { skill → 'high'|'medium'|'low' }
 *    - `question_groups`: ordered list with `round_type` and `question` text per Q
 *
 *  We reverse skill_question_map into per-question rows so the UI can render
 *  the Σ(score × weight) / Σ(weights) calculation row-by-row.
 */
/** Extract the bundled follow-up note from a question_history row, if present.
 *  The metadata (`followup_bundled` + `followup_reason` + `followup_focus_skill`
 *  + `followup_source_qnum`) is stamped by the backend when a planned P2/P3 slot
 *  was reframed as a follow-up because the candidate volunteered the skill
 *  earlier. Shared by ALL row-builders (history / conversation / groups) so the
 *  note can NEVER silently disappear just because the source-selection heuristic
 *  picked a different builder — it's keyed off the saved row, not the builder.
 *  See [[project_question_analysis_builder_selection]]. */
function bundledFollowUpFromRow(row: any): PerQuestionDetail['bundledFollowUp'] {
  // HR questions are ALWAYS standalone — never a reframed follow-up probing a
  // technical/Must-Have skill. A backend boundary-lag bug sometimes tags an HR
  // question (e.g. the closing "Why should we hire you?") with a bundled
  // follow-up on a Must-Have skill; suppress that here so HR questions never
  // show as "Follow-up" with a cross-round skill note.
  if (String(row?.round_type || '').toLowerCase() === 'hr') return undefined;
  const reason = String(row?.followup_reason || '').trim();
  if (!row?.followup_bundled || !reason) return undefined;
  const srcQ = row?.followup_source_qnum;
  const prior = String(row?.followup_prior_level || '').trim().toLowerCase();
  const excerpt = String(row?.followup_source_excerpt || '').trim();
  return {
    reason: reason || undefined,
    focus_skill: String(row?.followup_focus_skill || '').trim() || undefined,
    source_qnum: typeof srcQ === 'number' && srcQ > 0 ? srcQ : undefined,
    prior_level: prior || undefined,
    source_excerpt: excerpt || undefined,
  };
}

/** Index question_history rows by normalized (trimmed, lowercased) question
 *  text. Lets the conversation / groups builders recover the authoritative
 *  per-row metadata (round_type section + bundled-followup note) for a turn
 *  they sourced from elsewhere. First write wins on duplicate text. */
function indexHistoryByText(questionHistory: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const h of questionHistory || []) {
    const txt = String(h?.question || '').trim().toLowerCase();
    if (txt && !m.has(txt)) m.set(txt, h);
  }
  return m;
}

/** True when an assistant transcript turn is NOT a real interview question:
 *  Bina's greeting, a silence nudge ("Are you there?"), a bare filler
 *  transition ("Let's move on to the next question."), or a closing message.
 *  Used by the source-selection heuristic so these noise turns don't inflate
 *  the transcript Q-count and wrongly out-vote a complete question_history. */
/** Meta / non-question assistant turns that must NEVER appear as a scored
 *  question in Question Analysis: the opening "about the role" warm-up, a
 *  redirect/deflection, a farewell, or a resume ack. Unlike the greeting
 *  filters below, this has NO word-count cap — the role warm-up is a long
 *  (~60-word) statement, so a ≤12-word cap let it slip through and show as
 *  Must-Have Q1 ("Hi, I'm Bina, your interviewer today. In the role of …").
 *  Matched by unique lead-ins that never open a real interview question; a real
 *  question that merely quotes one still has a "?" and is kept. */
function isMetaAssistantTurn(content: string): boolean {
  const t = (content || '').toLowerCase().trim();
  if (!t) return false;
  // Unambiguous silence nudges — these NEVER carry a real question, so match
  // them even if the turn has a "?" (e.g. "Are you there? Take your time…").
  const ALWAYS = [
    'are you there', "didn't get any response", 'did not get any response',
    "couldn't get any response", 'could not get any response',
    'if you’re there, please start speaking', "if you're there, please start speaking",
  ];
  if (ALWAYS.some(m => t.includes(m))) return true;
  // "Let's move on to the next question" is a nudge ONLY when it stands alone.
  // As a PREAMBLE to a real question ("…let's move on to the next question.
  // What is your expected salary?") it introduces a genuine turn — the HR salary
  // question was being dropped because it matched here. Treat it as meta only
  // when NO real question follows the phrase.
  const MOVE_ON = ['move on to the next question', "let's move on to the next", 'lets move on to the next'];
  for (const m of MOVE_ON) {
    const idx = t.indexOf(m);
    if (idx < 0) continue;
    const after = t.slice(idx + m.length);
    const hasTrailingQuestion = after.includes('?') && /[a-z]{3,}/.test(after);
    if (!hasTrailingQuestion) return true; // bare nudge with nothing real after it
  }
  // Statement-only meta (role warm-up, deflection, farewell, resume ack). A real
  // question that merely quotes one of these still has a "?" and is kept.
  if (t.includes('?')) return false;
  const META = [
    'your interviewer today', "here's a quick overview", 'here is a quick overview',
    'here to conduct the interview', 'here to conduct this interview',
    "i'm here to listen", 'im here to listen',
    "let's focus on the interview", 'lets focus on the interview',
    'completing the interview', 'responses have been recorded',
    'wish you all the best', 'future endeavors', 'welcome back',
    // Closing / sendoff turn — LLM wording varies (often prefixed by an
    // acknowledgment: "That's a compelling case… This concludes our interview…").
    // None of these appear in a real interview question.
    'concludes our interview', 'concludes the interview', 'concludes this interview',
    'pleasure speaking with you', 'best of luck with the next steps',
    'best of luck in the next steps',
  ];
  return META.some(m => t.includes(m));
}

function isNoiseAssistantTurn(content: string): boolean {
  const t = (content || '').toLowerCase().trim();
  if (!t) return true;
  // Role warm-up / deflection / farewell / resume ack — length-independent.
  if (isMetaAssistantTurn(t)) return true;
  // Greeting turn — but ONLY when it's a pure greeting with no question
  // attached. The combined greeting+Q1 ("Hi! I'm Bina — let's start. Can
  // you walk me through your React experience?") IS a real interview turn
  // and must NOT be filtered out, or the convoQApprox count drops below the
  // history count and the builder-selection heuristic incorrectly routes
  // away from the COMPLETE history builder. Mirror of the `_isGreeting`
  // gating inside buildPerQuestionDetailsFromHistory (2026-05-28).
  if (/\bi['’]?\s*m\s+linda\b/.test(t) || /\bi\s+am\s+linda\b/.test(t)) {
    const hasQuestion = t.includes('?');
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (!hasQuestion && wordCount <= 12) return true;
  }
  // Silence nudges / attention probes.
  if (
    t.startsWith('are you there') || t.startsWith('are you still there') ||
    t.startsWith('can you hear me') || /^(?:are you|still) with me\b/.test(t) ||
    (t.includes('take your time') && t.includes('share whatever'))
  ) return true;
  // Bare filler transition with no actual question.
  if (/^let['’]?s move on to the next question\.?$/.test(t)) return true;
  // Closing.
  if (
    t.includes('thank you for completing the interview') ||
    t.includes('thank you for your time today')
  ) return true;
  return false;
}

function buildPerQuestionDetails(
  eval_: any,
  clusterPriorityBySkill: Record<string, Level> = {},
  clusterCanonicalNameBySkill: Record<string, string> = {},
  conversationTranscript: any[] = [],
): PerQuestionDetail[] {
  // Source dispatch — choose whichever yields the MOST rows so the
  // Analysis page doesn't undercount turns. The candidates, richest first:
  //   • conversation_transcript — raw chat log, what the Transcript view
  //     uses (~30 messages for a 15-turn interview). Used when the backend
  //     under-recorded question_history (observed: kanimozhi had 31 chat
  //     messages but only 7 history rows because the skip-flow doesn't
  //     fire add_question_history_entry on every "I don't know" turn).
  //   • question_groups + follow_ups — when groups are present and rich.
  //   • question_history — when groups are sparse or absent.
  //   • legacy skill_question_map reverse-index — older sessions only.
  const questionGroups = (eval_?.question_groups || []) as any[];
  const questionHistory = (eval_?.question_history || []) as any[];

  // Effective count from question_groups = mains + sum(follow_ups).
  const groupsCount = questionGroups.reduce((sum, g) => {
    const fu = Array.isArray(g?.follow_ups) ? g.follow_ups.length : 0;
    return sum + 1 + fu;
  }, 0);
  const historyCount = questionHistory.length;
  const hasAssignedSnapshot = questionHistory.some(
    q => Array.isArray(q?.assigned_skills) && q.assigned_skills.length > 0
  );

  // Approximate the count of REAL questions in conversation_transcript: count
  // assistant turns, but EXCLUDE the greeting / silence-nudge / filler /
  // closing turns the same way buildPerQuestionDetailsFromConversation does.
  // The old count included that noise, which inflated the transcript total
  // (e.g. 21 assistant turns for a 15-question interview) and wrongly made
  // the conversation source out-vote a COMPLETE question_history — losing the
  // round_type sectioning (NTH questions vanished), the assigned-skills
  // snapshot, the per-skill scores, AND the bundled follow-up note (only the
  // history builder carries those).
  const convoQApprox = (conversationTranscript || []).filter(
    m => m?.role === 'assistant' && typeof m?.content === 'string' &&
         m.content.trim() && !isNoiseAssistantTurn(m.content)
  ).length;

  // question_history is the richest source when it carries the slot-plan
  // snapshot (assigned_skills + round_type + bundled-followup metadata +
  // per-skill scores). Prefer it unless the transcript shows the backend
  // genuinely UNDER-recorded — i.e. it has materially more real questions
  // than history rows (the kanimozhi case: 31 chat turns vs 7 history rows
  // because the skip-flow dropped add_question_history_entry calls). The 0.8
  // ratio tolerates a turn or two of slack (an unrecorded availability Q, a
  // filler row) without flipping a complete history to the lossy convo path.
  const historyIsComplete =
    hasAssignedSnapshot && historyCount >= convoQApprox * 0.8;
  if (historyIsComplete) {
    return buildPerQuestionDetailsFromHistory(eval_, clusterPriorityBySkill, clusterCanonicalNameBySkill);
  }

  // Pick the richest source.
  if (convoQApprox > Math.max(groupsCount, historyCount)) {
    return buildPerQuestionDetailsFromConversation(
      conversationTranscript,
      questionHistory,
      clusterPriorityBySkill,
      clusterCanonicalNameBySkill,
      (eval_?.evaluations || []) as any[],
    );
  }
  if (historyCount > groupsCount && hasAssignedSnapshot) {
    return buildPerQuestionDetailsFromHistory(eval_, clusterPriorityBySkill, clusterCanonicalNameBySkill);
  }
  if (questionGroups.length > 0) {
    return buildPerQuestionDetailsFromGroups(
      eval_,
      clusterPriorityBySkill,
      clusterCanonicalNameBySkill,
    );
  }
  if (hasAssignedSnapshot) {
    return buildPerQuestionDetailsFromHistory(eval_, clusterPriorityBySkill, clusterCanonicalNameBySkill);
  }
  return buildPerQuestionDetailsLegacy(eval_, clusterPriorityBySkill);
}

/**
 * Build per-question rows from question_groups (transcript-aligned).
 *
 * One row per main Q in groups (follow-ups intentionally skipped here — they
 * share the parent slot and the Transcript view is the place to drill into
 * them). Q-numbers are sequential idx+1 over the groups array, matching
 * buildInterviewResponses' `id: idx+1`, so a recruiter glancing between
 * Transcript Q7 and Analysis Q7 sees the same question.
 *
 * Skills source priority for each Q:
 *   1. Matching question_history row's assigned_skills (planner snapshot —
 *      best when persisted, gives the full primary+secondaries set). We
 *      match by exact question text within the same round_type.
 *   2. The group's own `skill` field (single skill the backend tagged the
 *      Q with — always present when groups are emitted).
 */
function buildPerQuestionDetailsFromGroups(
  eval_: any,
  clusterPriorityBySkill: Record<string, Level> = {},
  clusterCanonicalNameBySkill: Record<string, string> = {},
): PerQuestionDetail[] {
  const groups = (eval_?.question_groups || []) as any[];
  const questionHistory = (eval_?.question_history || []) as any[];
  const questionSkillMap = (eval_?.question_skill_map || {}) as Record<string | number, any[]>;

  const scoringRowsForQ = (rawQNum: any): any[] => {
    const num = Number(rawQNum);
    const rows = questionSkillMap[num] ?? questionSkillMap[String(rawQNum)];
    return Array.isArray(rows) ? rows : [];
  };

  // Index history by exact question text (lowercase) for skill enrichment.
  const historyByText = new Map<string, any>();
  for (const h of questionHistory) {
    const txt = String(h?.question || '').trim().toLowerCase();
    if (txt && !historyByText.has(txt)) historyByText.set(txt, h);
  }

  // Greeting detection mirrors buildPerQuestionDetailsFromHistory.
  const _isGreeting = (txt: string): boolean => {
    const t = (txt || '').toLowerCase();
    return /\bi['’]?\s*m\s+linda\b/.test(t) || /\bi\s+am\s+linda\b/.test(t);
  };

  const sectionFromRT = (rt: any): PerQuestionDetail['section'] => {
    const r = String(rt || '').toLowerCase();
    if (r === 'nice_to_have_skills') return 'nth';
    if (r === 'hr') return 'hr';
    return 'mth';
  };

  // Flatten groups → one row per main Q AND one row per follow-up. The
  // Transcript view (buildInterviewResponses) does the same flattening with
  // its `id: idx++` counter, so this produces a 1:1 alignment of Q-numbers
  // between Transcript Q7 and Analysis Q7 — even for follow-ups.
  //
  // Each follow-up's skills default to the parent group's skill set (a
  // follow-up shares the parent's slot, so it probes the same skill).
  void clusterCanonicalNameBySkill; // (reserved for future skill-name normalization)

  const out: PerQuestionDetail[] = [];
  let nextQ = 1;

  const dedupeKeepCase = (names: string[]): string[] => {
    const seen = new Set<string>();
    const r: string[] = [];
    for (const s of names) {
      const k = String(s).toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      r.push(s);
    }
    return r;
  };

  const buildSkillRows = (names: string[], scoringRows: any[] = []): PerQuestionSkill[] =>
    names.map(name => {
      const priority = clusterPriorityBySkill[String(name).toLowerCase().trim()] || 'Medium';
      const sl = String(name).toLowerCase().trim();
      const matchedRow = scoringRows.find((r: any) => {
        const topic = String(r?.skill || r?.topic || '').toLowerCase().trim();
        return topic === sl || (topic && (topic.includes(sl) || sl.includes(topic)));
      });
      return {
        name,
        priority,
        weight: PRIORITY_WEIGHT[priority],
        score: matchedRow ? Math.round((Number(matchedRow?.score) || 0) * 10) / 10 : 0,
        note: matchedRow ? String(matchedRow?.note || '') : '',
      };
    });

  const computeQuestionScore = (skills: PerQuestionSkill[]): number => {
    const scored = skills.filter(k => k.score > 0);
    const sumW = scored.reduce((s, k) => s + k.weight, 0);
    const sumWS = scored.reduce((s, k) => s + k.score * k.weight, 0);
    return sumW > 0 ? Math.round((sumWS / sumW) * 10) / 10 : 0;
  };

  for (const g of groups) {
    const mainQ = String(g?.question || '');
    // Skip the role warm-up / deflection / farewell / resume ack — these are
    // not interview questions (length-independent guard; the ≤12-word greeting
    // filter misses the long role message).
    if (isMetaAssistantTurn(mainQ)) continue;
    const mainA = String(g?.answer || '');
    const matched = historyByText.get(mainQ.trim().toLowerCase());
    const mainScoreRows = scoringRowsForQ(matched?.question_number ?? g?.q_num);

    // Main Q skills: prefer persisted assigned_skills (richer multi-skill
    // set), fall back to the group's single g.skill.
    let mainSkillNames: string[] = [];
    if (mainScoreRows.length > 0) {
      mainSkillNames = mainScoreRows.map((r: any) => String(r?.skill || r?.topic || '').trim());
    } else if (matched && Array.isArray(matched.assigned_skills) && matched.assigned_skills.length > 0) {
      mainSkillNames = matched.assigned_skills.filter(
        (s: any) => typeof s === 'string' && s.trim(),
      );
    } else if (typeof g?.skill === 'string' && g.skill.trim()) {
      mainSkillNames = [g.skill.trim()];
    }
    mainSkillNames = dedupeKeepCase(mainSkillNames);
    const section = sectionFromRT(matched?.round_type);
    const mainSkills = buildSkillRows(mainSkillNames, mainScoreRows);

    out.push({
      qNum: nextQ++,
      section,
      question: mainQ,
      answer: mainA,
      skills: mainSkills,
      questionScore: mainScoreRows.length > 0
        ? computeQuestionScore(mainSkills)
        : typeof matched?.score === 'number'
          ? Math.round(matched.score * 10) / 10
          : 0,
      // Recover the bundled-followup note from the matched history row so it
      // survives even when this (groups) builder is the one selected.
      bundledFollowUp: bundledFollowUpFromRow(matched),
      // Per-question "why this score" rationale (backend-composed).
      scoreRationale: String(g?.score_rationale || matched?.score_rationale || ''),
    });

    // Follow-ups inherit the parent's skill set when their own entry
    // doesn't carry one. The Transcript renders them with a "↳" prefix;
    // Analysis just shows them as the next Q-number — keeps Q-numbers
    // aligned across both tabs.
    const followUps = Array.isArray(g?.follow_ups) ? g.follow_ups : [];
    for (const fu of followUps) {
      const fuQ = String(fu?.question || '');
      const fuA = String(fu?.answer || '');
      const fuMatched = historyByText.get(fuQ.trim().toLowerCase());
      const fuScoreRows = scoringRowsForQ(fuMatched?.question_number ?? fu?.q_num);
      let fuSkillNames: string[] = [];
      if (fuScoreRows.length > 0) {
        fuSkillNames = fuScoreRows.map((r: any) => String(r?.skill || r?.topic || '').trim());
      } else if (fuMatched && Array.isArray(fuMatched.assigned_skills) && fuMatched.assigned_skills.length > 0) {
        fuSkillNames = fuMatched.assigned_skills.filter(
          (s: any) => typeof s === 'string' && s.trim(),
        );
      } else if (typeof fu?.skill === 'string' && fu.skill.trim()) {
        fuSkillNames = [fu.skill.trim()];
      } else {
        // Default to parent's skill set so the follow-up isn't shown bare.
        fuSkillNames = mainSkillNames.slice();
      }
      fuSkillNames = dedupeKeepCase(fuSkillNames);
      const fuSkills = buildSkillRows(fuSkillNames, fuScoreRows);

      out.push({
        qNum: nextQ++,
        section,
        question: fuQ,
        answer: fuA,
        skills: fuSkills,
        questionScore: fuScoreRows.length > 0
          ? computeQuestionScore(fuSkills)
          : typeof fuMatched?.score === 'number'
            ? Math.round(fuMatched.score * 10) / 10
            : 0,
        bundledFollowUp: bundledFollowUpFromRow(fuMatched),
        scoreRationale: String(fu?.score_rationale || fuMatched?.score_rationale || ''),
      });
    }
    void _isGreeting; // greeting filter intentionally NOT applied here —
                     // matching Transcript means showing the greeting as Q1.
  }

  return out;
}

/**
 * Build per-question rows from question_history (preferred path).
 *
 * Drives off:
 *   - question_history[i].assigned_skills   — planner snapshot (every skill
 *                                              the slot was meant to probe)
 *   - question_history[i].round_type        — section assignment
 *   - question_history[i].question / answer — display + transcript hook
 *   - evaluations[] (filtered by question_number + topic) — per-skill score
 *                                              + evaluator note
 *
 * Sequentially renumbers (1..N) for display so gaps from follow-ups /
 * auto-skipped slots in the raw question_number stream don't surface in
 * the UI. Filters out follow-ups and slot-auto-skips so the recruiter sees
 * only the actually-asked main questions.
 */
function buildPerQuestionDetailsFromHistory(
  eval_: any,
  clusterPriorityBySkill: Record<string, Level> = {},
  clusterCanonicalNameBySkill: Record<string, string> = {},
): PerQuestionDetail[] {
  const questionHistory = (eval_?.question_history || []) as any[];
  const evaluations = (eval_?.evaluations || []) as any[];
  const questionSkillMap = (eval_?.question_skill_map || {}) as Record<string | number, any[]>;

  // Group evaluations by question_number → list of skill-rows. A single
  // delivered question can have multiple eval rows (one per assigned
  // skill) under the multi-skill scoring scheme.
  const evalsByQ: Record<number, any[]> = {};
  for (const ev of evaluations) {
    const qn = Number(ev?.question_number || 0);
    if (!qn) continue;
    (evalsByQ[qn] = evalsByQ[qn] || []).push(ev);
  }

  const scoringRowsForQ = (qn: number): any[] => {
    const rows = questionSkillMap[qn] ?? questionSkillMap[String(qn)];
    return Array.isArray(rows) ? rows : [];
  };

  // Detector for skipped / IDK responses. The evaluator often
  // mis-scores these as `topic="Behavioural", score=5.0` (observed in
  // production: Be25 session q=25/27/29). Without this guard, the
  // Q-level fallback would propagate that 5.0 to every planned skill
  // on the question — showing the candidate as having demonstrated
  // skills they explicitly didn't answer.
  const isSkippedOrIdk = (entry: any): boolean => {
    const rt = String(entry?.response_type || '').toLowerCase();
    // Backend-set response_type covers timer/silence skips + the
    // dedicated IDK pipeline. auto_skipped_by_coverage is already
    // filtered earlier, but kept here for safety.
    if (
      rt === 'skipped' || rt === 'not_answered' || rt === 'timeout' || rt === 'idk' ||
      rt === 'low_coverage' || rt === 'auto_skipped_by_coverage'
    ) {
      return true;
    }
    // Fallback to answer text — older sessions stored "[SKIPPED]" /
    // "I don't know" without setting response_type cleanly.
    const ansRaw = String(entry?.answer || '').trim();
    if (!ansRaw) return true;
    const ans = ansRaw.toLowerCase();
    if (ans === '[skipped]') return true;
    if (ans === "i don't know." || ans === "i don't know" || ans === 'i dont know' || ans === 'i dont know.') return true;
    if (ans === "i don't know yet" || ans === 'idk' || ans === "i'm not sure" || ans === 'not sure') return true;
    return false;
  };

  // Per-skill score lookup: prefer exact topic match, then substring.
  // Returns `is_fallback: true` (with the question-level entry.score)
  // when the evaluator emitted no row for this specific skill. Reason:
  // the evaluator scores the skill its eval row names, which often
  // diverges from the planned skill when the LLM-emitted question text
  // covered a different topic than the slot plan (slot drift in older
  // sessions). Without a fallback, the candidate is shown 0 for skills
  // they actually answered — misleading. With the fallback, the score
  // reflects their overall answer quality on that question and a "Q"
  // badge in the UI tells the reviewer it's not a direct per-skill
  // assessment.
  //
  // SKIPPED/IDK CAVEAT: When `isSkipped=true`, the fallback is
  // suppressed (score=0, is_skipped=true). The evaluator commonly
  // mis-scores skipped/IDK answers as topic="Behavioural" with
  // score=5.0 — falling back to that would show the candidate as
  // having demonstrated skills they explicitly didn't answer.
  const scoreForSkill = (
    qn: number,
    skill: string,
    qLevelFallback: number | null,
    isSkipped: boolean,
  ): { score: number; note: string; is_fallback: boolean; is_skipped: boolean; is_unscored: boolean } => {
    const sl = skill.toLowerCase().trim();
    const scoringRows = scoringRowsForQ(qn);
    const rows = evalsByQ[qn] || [];
    const readScore = (r: any): number => {
      const raw = Number(r?.score ?? r?.evaluation?.overall ?? 0);
      return Math.max(0, Math.min(10, isFinite(raw) ? raw : 0));
    };
    const readNote = (r: any): string =>
      String(r?.one_line_note || r?.evaluation?.brief_note || '').slice(0, 250);
    const readScoringScore = (r: any): number =>
      Math.max(0, Math.min(10, Number(r?.score) || 0));
    const readScoringNote = (r: any): string =>
      String(r?.note || '').slice(0, 250);

    // Prefer the backend's whole-interview question-skill rows when present.
    for (const r of scoringRows) {
      const topic = String(r?.skill || r?.topic || '').toLowerCase().trim();
      if (topic === sl) {
        return { score: readScoringScore(r), note: readScoringNote(r), is_fallback: false, is_skipped: false, is_unscored: false };
      }
    }
    for (const r of scoringRows) {
      const topic = String(r?.skill || r?.topic || '').toLowerCase().trim();
      if (topic && (topic.includes(sl) || sl.includes(topic))) {
        return { score: readScoringScore(r), note: readScoringNote(r), is_fallback: false, is_skipped: false, is_unscored: false };
      }
    }

    // Exact then substring match — these are real local per-skill scores
    // (even on skipped questions, if the evaluator did emit one).
    for (const r of rows) {
      const topic = String(r?.topic || r?.evaluation?.topic || '').toLowerCase().trim();
      if (topic === sl) {
        return { score: readScore(r), note: readNote(r), is_fallback: false, is_skipped: false, is_unscored: false };
      }
    }
    for (const r of rows) {
      const topic = String(r?.topic || r?.evaluation?.topic || '').toLowerCase().trim();
      if (topic && (topic.includes(sl) || sl.includes(topic))) {
        return { score: readScore(r), note: readNote(r), is_fallback: false, is_skipped: false, is_unscored: false };
      }
    }
    // Skipped/IDK: suppress fallback. Show 0 with the is_skipped flag
    // so the UI can render a "Skipped" badge — better than a misleading
    // 5.0 inherited from the evaluator's "Behavioural" mis-score.
    if (isSkipped) {
      return { score: 0, note: '', is_fallback: false, is_skipped: true, is_unscored: false };
    }
    // Fallback: question-level score (so a real answer doesn't show 0
    // just because the evaluator graded a different topic name). Only
    // fires when qLevelFallback is positive; an entry.score of 0 means
    // the candidate genuinely scored 0 and we surface that honestly.
    if (typeof qLevelFallback === 'number' && qLevelFallback > 0) {
      return {
        score: Math.max(0, Math.min(10, qLevelFallback)),
        note: '',
        is_fallback: true,
        is_skipped: false,
        is_unscored: false,
      };
    }
    // No evaluator row, not skipped, no positive question-level score: this
    // skill was simply NOT evaluated. Per the scoring spec the backend never
    // fabricates a 0.0 here (transcript_evaluation_service.py:3209-3214) — we
    // mustn't either. Flag is_unscored so the weighted average EXCLUDES it and
    // the UI renders "Not evaluated" instead of a candidate-tanking 0.0.
    return { score: 0, note: '', is_fallback: false, is_skipped: false, is_unscored: true };
  };

  const sectionFromRT = (rt: any): PerQuestionDetail['section'] => {
    const r = String(rt || '').toLowerCase();
    if (r === 'nice_to_have_skills') return 'nth';
    if (r === 'hr') return 'hr';
    return 'mth';
  };

  // Filter: only main questions actually delivered to the candidate.
  // - is_follow_up: skip (sub-interactions roll up under their parent)
  // - response_type='auto_skipped_by_coverage': slot was bypassed, never asked
  // - empty question text: synthetic placeholder rows from padding
  // - duplicate skip rows: when a slot times out or is auto-skipped after a
  //   candidate stops responding, the backend records a row that inherits
  //   `current_question` (the last spoken question text). The same Q text
  //   then appears 2-5 times in the UI with only the first being the real
  //   ask. Collapse later skip rows that share question text + round_type
  //   with an earlier row in the same section.
  // Greeting filter: Bina's opening turn often contains "I'm Bina" intro
  // text. The PURE greeting ("Hi! I'm Bina, your AI interviewer. Let's
  // begin.") has no question mark and should be dropped. But the COMBINED
  // greeting+Q1 ("Hi! I'm Bina — let's start. Can you tell me about your
  // React experience?") DOES carry the actual Q1 and must NOT be dropped —
  // dropping it makes Q1 disappear from Question Analysis entirely.
  //
  // 2026-05-28 fix: gate on "no question mark" AND "no substantive content
  // beyond the greeting". The original blanket drop ("i'm linda" anywhere
  // → discard") was hiding Q1 whenever Bina's first turn combined intro
  // and question. Restoring Q1 requires being more discriminating about
  // what counts as a "pure greeting" turn.
  const _isGreeting = (q: any): boolean => {
    const txt = String(q?.question || '').toLowerCase();
    const hasLindaIntro =
      /\bi['’]?\s*m\s+bina\b/.test(txt) || /\bi\s+am\s+bina\b/.test(txt);
    if (!hasLindaIntro) return false;
    // If the turn carries an actual question (question mark present), it is
    // the combined greeting+Q1 — keep it so Q1 isn't dropped.
    if (txt.includes('?')) return false;
    // If the turn is long enough to plausibly contain a question without
    // punctuation (e.g. "Tell me about your React experience"), keep it.
    // 12 words is generous — pure greetings are well under this.
    const wordCount = txt.split(/\s+/).filter(Boolean).length;
    if (wordCount > 12) return false;
    return true;
  };
  // Stamp each history row with its chronological position BEFORE filtering
  // so dropped rows (greeting / duplicates) don't shift the surviving rows'
  // numbers. The Q-numbers shown on the Analysis page then match the
  // Transcript view's Q-numbers exactly — Transcript Q3 = Analysis Q3.
  const indexedHistory = questionHistory.map((q, idx) => ({ ...q, _historyIdx: idx }));

  // Filter relaxed (was previously dropping is_follow_up + several
  // skip-response-types + same-text skip rows). Reason: the backend
  // mis-labels follow-up rows. After a candidate says "I don't know" the
  // skip-recovery path emits the NEXT main question with is_follow_up=true
  // tagged on it, even though the new question covers a different slot
  // and different skills. Dropping those rows hid 8-9 of 15 delivered
  // questions on observed sessions, leaving the recruiter convinced the
  // interview broke. Now we drop only:
  //   • greeting (combined intro + Q1)
  //   • empty question text
  //   • auto_skipped_by_coverage (slot was bypassed, never asked)
  //   • exact-duplicate question text within the same round (collapses
  //     timeout/silence echo rows that inherit the previous question text)
  const _seenExactKeys = new Set<string>();
  // Split history into main candidates and explicit follow-ups. A row
  // counts as a follow-up only when `is_follow_up=true` AND a non-empty
  // parent_question_number points to an earlier main row (lower qnum).
  // Bug-tagged rows where is_follow_up=true but parent_question_number is
  // missing/equal still flow into the main filter (backwards-compat with
  // the skip-recovery mis-tagging documented earlier).
  const explicitFollowUps = indexedHistory.filter(q => {
    if (!q?.is_follow_up) return false;
    const parentQn = Number(q?.parent_question_number);
    const ownQn = Number(q?.question_number);
    if (!Number.isFinite(parentQn) || parentQn <= 0) return false;
    if (Number.isFinite(ownQn) && ownQn === parentQn) return true; // standard follow-up shares parent qnum
    // Or it sits ahead of its parent in chronological order — fine.
    return parentQn < (ownQn || Number.MAX_SAFE_INTEGER);
  });
  const followUpHistoryIds = new Set(
    explicitFollowUps.map(f => Number(f._historyIdx)),
  );
  const mains = indexedHistory.filter(q => {
    if (followUpHistoryIds.has(Number(q._historyIdx))) return false;
    if (_isGreeting(q)) return false;
    // Length-independent meta guard — catches the long role warm-up /
    // deflection / farewell that the ≤12-word _isGreeting misses.
    if (isMetaAssistantTurn(String(q?.question || ''))) return false;
    if (!q?.question || !String(q.question).trim()) return false;
    const rt = String(q?.response_type || '').toLowerCase();
    if (rt === 'auto_skipped_by_coverage') return false;
    const _qText = String(q.question).trim().toLowerCase();
    const _rtKey = String(q?.round_type || '').toLowerCase();
    const _key = `${_rtKey}::${_qText}`;
    if (_seenExactKeys.has(_key)) return false;
    _seenExactKeys.add(_key);
    return true;
  });
  // Sort by the chronological history index so Analysis order matches
  // Transcript order. The transcript adapter renders rows in their raw
  // history-array order; we now mirror that here even after filtering.
  mains.sort((a, b) => Number(a._historyIdx) - Number(b._historyIdx));

  // Group follow-ups by their parent_question_number so each main row
  // can attach the right set when we render it. Each entry preserves
  // the chronological order they were asked (history index ascending).
  explicitFollowUps.sort((a, b) => Number(a._historyIdx) - Number(b._historyIdx));
  const followUpsByParentQn = new Map<number, PerQuestionFollowUp[]>();
  for (const fu of explicitFollowUps) {
    const parentQn = Number(fu?.parent_question_number);
    if (!Number.isFinite(parentQn) || parentQn <= 0) continue;
    const ev = (evalsByQ[parentQn] || []).find(
      e => String(e?.question || '').trim() === String(fu?.question || '').trim(),
    );
    const fuScore = typeof fu?.score === 'number'
      ? fu.score
      : ev
        ? Math.max(0, Math.min(10, Number(ev?.score ?? ev?.evaluation?.overall ?? 0)))
        : undefined;
    const entry: PerQuestionFollowUp = {
      question: String(fu?.question || '').trim(),
      answer: String(fu?.answer || '').trim(),
      topic: String(fu?.topic || ev?.topic || ev?.evaluation?.topic || '').trim() || undefined,
      score: typeof fuScore === 'number' ? Math.round(fuScore * 10) / 10 : undefined,
      note: String(ev?.one_line_note || ev?.evaluation?.brief_note || '').slice(0, 250) || undefined,
      // Trigger metadata stamped by the backend when the followup fired.
      // Drives the "Note: This follow-up was asked because..." line in
      // the UI so recruiters know why an extra question appeared at
      // this slot.
      reason: String(fu?.followup_reason || '').trim() || undefined,
      focus_skill: String(fu?.followup_focus_skill || '').trim() || undefined,
      source_qnum: typeof fu?.followup_source_qnum === 'number' && fu.followup_source_qnum > 0
        ? fu.followup_source_qnum
        : undefined,
    };
    if (!followUpsByParentQn.has(parentQn)) followUpsByParentQn.set(parentQn, []);
    followUpsByParentQn.get(parentQn)!.push(entry);
  }

  // Map evaluator topic strings (possibly truncated / paraphrased — e.g.
  // "cloud platforms") back to the canonical JD skill name (e.g.
  // "Familiarity with cloud platforms like AWS or Azure") so the per-Q
  // breakdown uses the same wording as the cluster panels. Falls back
  // to the raw topic when no JD match.
  const canonicalKeys = Object.keys(clusterCanonicalNameBySkill);
  const normalizeSkillName = (topic: string): string => {
    const tl = String(topic || '').toLowerCase().trim();
    if (!tl) return topic;
    const exact = clusterCanonicalNameBySkill[tl];
    if (exact) return exact;
    let best: string | null = null;
    let bestLen = 0;
    for (const k of canonicalKeys) {
      if (k.includes(tl) || tl.includes(k)) {
        if (k.length > bestLen) {
          best = clusterCanonicalNameBySkill[k];
          bestLen = k.length;
        }
      }
    }
    return best || topic;
  };

  return mains.map((q, idx): PerQuestionDetail => {
    // Two question numbers, used for different things:
    //   • origQ: the raw question_number from the history row. Used for
    //     lookup against evalsByQ (the LLM evaluator keys per-skill rows
    //     by this number, so the join must use the original value).
    //   • displayQ: the row's chronological position in question_history,
    //     so Analysis Q-numbers MATCH Transcript Q-numbers. The transcript
    //     adapter (buildInterviewResponses) uses `id: idx + 1` over the
    //     unfiltered history array. We mirror that here by reading the
    //     `_historyIdx` we stamped on each row before filtering — that
    //     position survives the filter so a row dropped from Analysis
    //     (greeting / duplicate) doesn't shift the numbers of rows that
    //     remain. A candidate sees Transcript Q3 = Analysis Q3, every time.
    const origQ = Number(q?.question_number || (idx + 1));
    const historyIdx = Number((q as any)?._historyIdx);
    const displayQ = Number.isFinite(historyIdx) ? historyIdx + 1 : idx + 1;
    const section = sectionFromRT(q?.round_type);
    const assigned: string[] = Array.isArray(q?.assigned_skills) ? q.assigned_skills : [];
    const recoveredRows = scoringRowsForQ(origQ);

    // Source priority for the displayed skill rows — recruiter spec
    // 2026-05-20: the Question Analysis tab must mirror the Question
    // Distribution plan exactly, so the planner snapshot
    // (`assigned_skills`) is now the primary source. This is what the
    // recruiter configured + what Question Distribution UI shows; the
    // Analysis tab has to match for the two views to line up.
    //   1. Planner snapshot — `assigned_skills` (the slot plan).
    //   2. Keyword scan of the actual question text (fallback when
    //      assigned_skills is empty, e.g. legacy interviews predating
    //      Phase 1 DB-derived slot truth).
    //   3. Evaluator's topic attribution (final fallback).
    const jdSkillNames = Object.values(clusterCanonicalNameBySkill);
    const fromText = findSkillsInText(String(q?.question || ''), jdSkillNames);

    const evalRows = evalsByQ[origQ] || [];
    const evalTopics: string[] = [];
    for (const r of evalRows) {
      const t = String(r?.topic || r?.evaluation?.topic || '').trim();
      if (t && t.toLowerCase() !== 'general') evalTopics.push(t);
    }

    let baseNames: string[];
    if (recoveredRows.length > 0) {
      baseNames = recoveredRows.map((r: any) => String(r?.skill || r?.topic || '').trim());
    } else if (assigned.length > 0) {
      baseNames = assigned;
    } else if (fromText.length > 0) {
      baseNames = fromText;
    } else if (evalTopics.length > 0) {
      baseNames = evalTopics.map(normalizeSkillName);
    } else {
      baseNames = [];
    }

    // Case-insensitive dedupe, preserve first-seen casing.
    const seen = new Set<string>();
    const skillNames: string[] = [];
    for (const s of baseNames) {
      const k = String(s).toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      skillNames.push(s);
    }

    // Read entry.score once — used both for per-skill fallback and the
    // final questionScore. When candidate answered substantively but the
    // evaluator didn't break out per-skill (slot drift / multi-skill Q
    // with only one assessed topic), every planned skill falls back to
    // this value so the candidate isn't shown 0 for skills they
    // effectively answered. is_fallback flag drives the "Q" badge in
    // the display layer. For SKIPPED/IDK responses, the fallback is
    // suppressed (see scoreForSkill) so the misleading evaluator score
    // (often "Behavioural"=5.0 for IDK) doesn't propagate.
    const partialDisplayScore = (
      String(q?.score_source || '').toLowerCase() === 'partial_runtime'
      && typeof q?.score === 'number'
    ) ? Number(q.score) : null;
    const entryScore = partialDisplayScore === null && typeof q?.score === 'number'
      ? q.score
      : null;
    const isSkippedRow = isSkippedOrIdk(q);

    const skills: PerQuestionSkill[] = skillNames.map(skillName => {
      const priority = clusterPriorityBySkill[String(skillName).toLowerCase().trim()] || 'Medium';
      const weight = PRIORITY_WEIGHT[priority];
      const { score, note, is_fallback, is_skipped, is_unscored } = scoreForSkill(
        origQ, skillName, entryScore, isSkippedRow,
      );
      return {
        name: skillName,
        priority,
        weight,
        score: Math.round(score * 10) / 10,
        note,
        is_fallback,
        is_skipped,
        is_unscored,
      };
    });
    skills.sort((a, b) => b.weight - a.weight || b.score - a.score);

    // Weighted question score = Σ(score × weight) / Σ(weight) — the spec's
    // exact formula, computed from the SAME per-skill scores shown on the
    // card so the displayed arithmetic is always self-consistent (this is
    // what fixes the "44.0 ÷ 11 = 2.40" mismatch: the question score must be
    // the weighted average of the rows the recruiter sees, not a separately
    // sourced entry.score). Unscored skills (no evaluator row) are EXCLUDED,
    // and true 0-scored skills are excluded as well to match the backend's
    // question-score rule (`score > 0` contributes; pure no-evidence rows do not).
    const scoredSkills = skills.filter(k => !k.is_unscored && k.score > 0);
    const hasEvaluatedSkill = skills.some(k => !k.is_unscored);
    const sumW = scoredSkills.reduce((s, k) => s + k.weight, 0);
    const sumWS = scoredSkills.reduce((s, k) => s + k.score * k.weight, 0);
    const weighted = sumW > 0 ? sumWS / sumW : 0;
    const questionScore = Math.round(weighted * 10) / 10;
    // Whole question is "Not evaluated" only when the evaluator produced NO
    // usable score rows for any skill on the slot. A real no-answer / skip /
    // IDK turn is still an evaluated question with score 0, so it must stay
    // counted instead of collapsing to "Not Evaluated".
    const isUnscored = skills.length > 0 && !hasEvaluatedSkill;

    // Attach explicit follow-ups for this main Q. Looked up by the raw
    // history question_number (origQ) since follow-up entries store the
    // same `parent_question_number`. displayQ is a chronological index
    // and doesn't match parent_question_number on older sessions.
    const followUps = followUpsByParentQn.get(origQ);

    // Bundled follow-up (Option A): this slot's single main question doubled
    // as a follow-up because a planned P2/P3 skill was volunteered earlier.
    // The note metadata lives on the main entry itself (not in followUps).
    const bundledFollowUp = bundledFollowUpFromRow(q);

    return {
      // Use origQ (backend question_number) not displayQ (historyIdx+1).
      // displayQ shifts when any history entry is filtered before MHS Q1
      // (e.g. a reconnect-ack at historyIdx=0), causing MHS Q1→slot2,
      // Q2→slot3 … a full one-slot mis-mapping of plan skills.
      // origQ is the backend's authoritative slot counter — stable regardless
      // of how many rows were filtered from the raw history array.
      qNum: origQ,
      section,
      question: String(q?.question || ''),
      answer: String(q?.answer || ''),
      // Carry the response type + skip source so the UI can distinguish
      // "Skipped" (candidate pressed Skip → skip_source='candidate') from
      // "Not Answered" (silence / timer / auto advance with no reply).
      responseType: String(q?.response_type || '').toLowerCase(),
      skipSource: String(q?.skip_source || '').toLowerCase(),
      skills,
      questionScore,
      isUnscored,
      displayOnlyQuestionScore: partialDisplayScore ?? undefined,
      followUps: followUps && followUps.length > 0 ? followUps : undefined,
      bundledFollowUp,
      // Per-question "why this score" rationale (backend-composed). The history
      // builder is the PREFERRED source when question_history is complete, so
      // without this the amber "Why this score" block never rendered for most
      // completed interviews — only ones that fell through to the groups builder.
      scoreRationale: String((q as any)?.score_rationale || ''),
    };
  });
}

/**
 * Build per-question rows from conversation_transcript (raw chat log).
 *
 * Used when question_history under-records (observed: kanimozhi session had
 * 31 chat messages but only 7 question_history rows because the skip flow
 * for "I don't know" responses doesn't fire add_question_history_entry on
 * every turn). The transcript view already renders all 15 turns from
 * conversation_transcript; this builder mirrors that so the Analysis tab
 * shows the same set.
 *
 * Pairing logic:
 *   - Walk the messages in order, skip system / meta-assistant messages
 *   - Each assistant message starts a new Q card
 *   - The next user message (if any) becomes that Q's answer
 *   - An assistant followed by another assistant (no user response) emits
 *     a Q card with empty answer
 *   - Skills are looked up by exact question-text match against
 *     question_history.assigned_skills, falling back to [] when no match
 */
function buildPerQuestionDetailsFromConversation(
  messages: any[],
  questionHistory: any[],
  clusterPriorityBySkill: Record<string, Level> = {},
  clusterCanonicalNameBySkill: Record<string, string> = {},
  evaluations: any[] = [],
): PerQuestionDetail[] {
  // JD skill names (canonical) for the text-scan fallback. When question_
  // history doesn't have a matching row for a turn, we scan Bina's question
  // text for any JD skill name and surface those as the assessed skills.
  // Catches turns the backend never persisted (skip-flow gaps) where the
  // question clearly probed real JD skills ("Python, R, or Java...").
  const jdSkillNames = Object.values(clusterCanonicalNameBySkill);

  // Index evaluations by exact question text for score lookup. Each LLM
  // evaluator row carries `evaluation.overall` (0-10 score) and
  // `evaluation.topic` (the skill scored). The same Q can have multiple
  // rows when multi-skill scoring is on — collect all of them.
  const evalsByText = new Map<string, any[]>();
  for (const e of evaluations || []) {
    const txt = String(e?.question || '').trim().toLowerCase();
    if (!txt) continue;
    if (!evalsByText.has(txt)) evalsByText.set(txt, []);
    evalsByText.get(txt)!.push(e);
  }
  // Index history by exact question text for skill enrichment + section
  // tagging. The section comes from the matched history row's round_type;
  // without it, every conversation-sourced card would default to MHS and
  // HR-round questions would silently disappear from the HR section.
  const skillsByText = new Map<string, string[]>();
  const roundTypeByText = new Map<string, string>();
  for (const h of questionHistory) {
    const txt = String(h?.question || '').trim().toLowerCase();
    if (!txt) continue;
    if (!roundTypeByText.has(txt)) {
      const rt = String(h?.round_type || '').trim();
      if (rt) roundTypeByText.set(txt, rt);
    }
    if (skillsByText.has(txt)) continue;
    const assigned = Array.isArray(h?.assigned_skills)
      ? h.assigned_skills.filter((s: any) => typeof s === 'string' && s.trim())
      : [];
    if (assigned.length > 0) skillsByText.set(txt, assigned);
  }
  // Full history rows by text — recovers the bundled-followup note for a turn
  // even when this (conversation) builder is the one selected. Without this
  // lookup the note only ever appears via the history builder, so any
  // selection flip drops it. See [[project_question_analysis_builder_selection]].
  const historyByText = indexHistoryByText(questionHistory);
  const bundledForQuestion = (qText: string): PerQuestionDetail['bundledFollowUp'] =>
    bundledFollowUpFromRow(historyByText.get(qText.trim().toLowerCase()));
  // Per-question "why this score" rationale — recovered from the matched
  // history row (this convo builder has no eval rows of its own).
  const rationaleForQuestion = (qText: string): string =>
    String(historyByText.get(qText.trim().toLowerCase())?.score_rationale || '');
  const sectionFromRT = (rt: string): PerQuestionDetail['section'] => {
    const r = (rt || '').toLowerCase();
    if (r === 'nice_to_have_skills') return 'nth';
    if (r === 'hr') return 'hr';
    return 'mth';
  };
  // HR-question heuristic for turns that aren't in question_history (so no
  // round_type to read). HR rounds use a small set of stable opener
  // phrasings — match on any of them and tag as 'hr' so the card lands
  // in the HR section. Conservative: anything that doesn't match a
  // pattern defaults to 'mth' as before.
  //
  // Expanded after seeing real sessions tag motivation/career-fit/
  // certifications/availability Qs as MHS. Categories covered:
  //   • Self-intro / background ("tell me about yourself")
  //   • Motivation / role fit ("what attracted you", "career goals", etc.)
  //   • Strengths / weaknesses / achievements
  //   • Behavioral (conflict / challenge / teamwork stories)
  //   • Logistics (salary, notice period, start date, availability)
  //   • Credential check (certifications) — these are factual, not skill-evaluative
  const _looksLikeHR = (q: string): boolean => {
    const t = (q || '').toLowerCase();
    return (
      /\btell me about yourself\b/.test(t)
      // Motivation / role fit — covers "what attracted you", "why this role",
      // "career goals", "how do you see it aligning"
      || /\bwhat (?:attracted|drew|brought) you (?:to)?\b/.test(t)
      || /\bwhy (?:do|did) you (?:want to|wish to)? ?(?:join|work|apply|choose)\b/.test(t)
      || /\b(?:career|professional) (?:goals?|aspirations?|growth|development|plan)\b/.test(t)
      || /\baligning? with your (?:career|professional|long.?term)\b/.test(t)
      || /\bmotivat(?:es|ed|ion)\b/.test(t)
      || /\bwhere do you see yourself\b/.test(t)
      // Strengths / weaknesses / achievements
      || /\bgreatest (?:strength|weakness|achievement)\b/.test(t)
      || /\b(?:biggest|notable|proudest) (?:achievement|accomplishment)\b/.test(t)
      // Behavioral stories — team / conflict / challenge
      || /\bteam(work)? (?:experience|collaboration|player)\b/.test(t)
      || /\bdescribe a (?:conflict|challenge|difficult|time when)\b/.test(t)
      || /\btell me about a time\b/.test(t)
      // Logistics — availability / salary / notice / start date
      || /\bwould you be able to (?:start|join|relocate)\b/.test(t)
      || /\b(?:start|join) (?:immediately|right away|asap)\b/.test(t)
      || /\b(?:notice|joining) period\b/.test(t)
      || /\bsalary (?:expectation|range)\b/.test(t)
      || /\bavailable to (?:start|join|relocate)\b/.test(t)
      // 2026-05-21: additional HR patterns observed in real sessions
      // (Chandra session b70e3a37: backend tagged HR Qs as `nth` due to
      // a round-transition timing bug — qh.round_type can't be trusted
      // for these. The frontend heuristic must catch them on the
      // question text alone so HR section isn't empty.)
      //   • "Are you open to {learning|relocating|...}" — growth/fit
      //   • "Are you available for {onsite|remote|hybrid|relocation}" —
      //     work-arrangement availability
      //   • "Are you comfortable working {in|with} a team" — collaboration
      //   • "Work style and preferences" — soft-skill probe opener
      //   • "How do you handle {pressure|stress|deadlines}" — behavioral
      || /\bare you open to\b/.test(t)
      || /\bare you available for\b/.test(t)
      || /\bare you (?:comfortable|willing|interested) (?:working|to work|with)\b/.test(t)
      || /\bwork style and preferences\b/.test(t)
      || /\bhow do you handle (?:pressure|stress|deadlines|conflict)\b/.test(t)
      // Credentials — certifications are factual recall, treated as HR-style
      // verification rather than skill-evaluative (the skill itself is
      // scored elsewhere when Bina actually probes it).
      || /\bdo you have (?:any|the) (?:.{0,20})?certification/.test(t)
      || /\bcertification(?:s|s? to mention)?\b/.test(t)
    );
  };
  // 2026-05-21: prefix-tolerant section lookup. The backend strips
  // acknowledgment prefixes ("No problem, let's move on. ", "Thank you
  // for sharing. ", "No worries, let's keep moving. ", etc.) from some
  // question_history entries — specifically the ones following an IDK
  // turn — while the conversation_transcript keeps the full prefix.
  // Exact-text matching against roundTypeByText then misses those
  // questions and they default to 'mth' even though their planned
  // round_type was 'nice_to_have_skills' / 'hr'. Observed for Chandra
  // (session b70e3a37): NTH showed only 2 rows because Q11 AWS, Q12
  // Docker, Q14 "open to learning", Q15 "available onsite" all matched
  // qh entries by suffix but not by exact text.
  //
  // Build a SUFFIX index keyed on the stored qh question — Bina's
  // transition prefix is always at the START in the transcript, never
  // at the end, so suffix containment is a safe heuristic.
  const roundTypeBySuffix: Array<{ key: string; rt: string }> = [];
  for (const [key, rt] of roundTypeByText.entries()) {
    // Skip very short qh entries (< 30 chars) — they risk substring
    // matching unrelated long questions. The real cases we want to
    // catch are full-sentence questions whose prefix got stripped.
    if (key.length >= 30) {
      roundTypeBySuffix.push({ key, rt });
    }
  }
  // Sort longest-first so the most specific suffix wins (avoids a
  // generic short qh entry shadowing a longer-matching one).
  roundTypeBySuffix.sort((a, b) => b.key.length - a.key.length);

  const resolveSection = (questionText: string): PerQuestionDetail['section'] => {
    const txt = questionText.trim().toLowerCase();
    // HR text heuristic FIRST — it overrides qh's round_type, which is
    // unreliable for HR questions (backend can tag them as `nth` if the
    // round transition fires late). When the question text is
    // unambiguously HR-style, trust the text over qh.
    if (_looksLikeHR(questionText)) return 'hr';
    const fromHistory = roundTypeByText.get(txt);
    if (fromHistory) return sectionFromRT(fromHistory);
    // Prefix-tolerant fallback: transcript text ends with stored qh text.
    for (const { key, rt } of roundTypeBySuffix) {
      if (txt.endsWith(key)) return sectionFromRT(rt);
    }
    return 'mth';
  };

  // Drop noise: system messages, empty content, Bina's meta-only chatter
  // (greeting prefixes with no follow-up question, closing thank-yous,
  // and silence-nudge prompts like "Are you there?" — those aren't real
  // interview questions, they're attention probes that shouldn't get
  // graded slots).
  const _isClosing = (c: string): boolean => {
    const t = c.toLowerCase();
    return (
      t.includes('thank you for completing the interview') ||
      t.includes('thank you for your time today') ||
      (t.includes('your responses have been recorded') && t.includes('wish you all the best')) ||
      t.includes('concludes our interview') ||
      t.includes('concludes the interview') ||
      t.includes('concludes this interview') ||
      t.includes('pleasure speaking with you') ||
      t.includes('best of luck with the next steps') ||
      t.includes('best of luck in the next steps')
    );
  };
  const _isSilenceNudge = (c: string): boolean => {
    const t = c.toLowerCase().trim();
    return (
      t.startsWith('are you there?') ||
      t.startsWith('are you still there?') ||
      t.startsWith('are you there ') ||
      // "Take your time — share whatever comes to mind" is the standard
      // soft prompt Bina fires after the first silence wait; not a Q.
      t.includes('take your time') && t.includes('share whatever') ||
      // "Can you hear me?" mic-check prompts
      t.startsWith('can you hear me?') ||
      // Generic "Are you with me?" / "Still with me?" check-ins
      /^(?:are you|still) with me\??/i.test(t)
    );
  };
  const cleaned = (messages || []).filter(m =>
    m?.role !== 'system'
    && typeof m?.content === 'string'
    && m.content.trim()
    && !(m.role === 'assistant' && _isClosing(m.content))
    && !(m.role === 'assistant' && _isSilenceNudge(m.content))
    // Role warm-up / deflection / farewell / resume ack — length-independent.
    && !(m.role === 'assistant' && isMetaAssistantTurn(m.content))
  );

  // Per-skill score lookup from evaluations[]. Match by question text +
  // skill name (case-insensitive, with substring fallback for evaluator
  // paraphrasing). When a question has exactly one eval row, reuse its
  // score for every assigned skill so single-tag LLM output doesn't leave
  // every skill at 0.
  const lookupSkillScoreAndNote = (
    questionText: string,
    skillName: string,
  ): { score: number; note: string } => {
    const rows = evalsByText.get(questionText.trim().toLowerCase()) || [];
    const sl = skillName.toLowerCase().trim();
    const readScore = (r: any): number => {
      const raw = Number(r?.evaluation?.overall ?? r?.score ?? 0);
      return Math.max(0, Math.min(10, isFinite(raw) ? raw : 0));
    };
    const readNote = (r: any): string =>
      String(r?.evaluation?.brief_note || r?.one_line_note || '').slice(0, 250);
    for (const r of rows) {
      const topic = String(r?.evaluation?.topic || r?.topic || '').toLowerCase().trim();
      if (topic === sl) return { score: readScore(r), note: readNote(r) };
    }
    for (const r of rows) {
      const topic = String(r?.evaluation?.topic || r?.topic || '').toLowerCase().trim();
      if (topic && (topic.includes(sl) || sl.includes(topic))) {
        return { score: readScore(r), note: readNote(r) };
      }
    }
    if (rows.length === 1) {
      return { score: readScore(rows[0]), note: readNote(rows[0]) };
    }
    return { score: 0, note: '' };
  };

  const buildSkillRows = (questionText: string, names: string[]): PerQuestionSkill[] =>
    names.map(name => {
      const priority = clusterPriorityBySkill[String(name).toLowerCase().trim()] || 'Medium';
      const { score, note } = lookupSkillScoreAndNote(questionText, name);
      return {
        name,
        priority,
        weight: PRIORITY_WEIGHT[priority],
        score: Math.round(score * 10) / 10,
        note,
      };
    });

  // Question Score = Σ(skill_score × skill_weight) / Σ(skill_weight)
  // Per spec doc §4 Step 3.
  const computeQuestionScore = (skills: PerQuestionSkill[]): number => {
    if (skills.length === 0) return 0;
    const sumW = skills.reduce((s, k) => s + k.weight, 0);
    const sumWS = skills.reduce((s, k) => s + k.score * k.weight, 0);
    return sumW > 0 ? Math.round((sumWS / sumW) * 10) / 10 : 0;
  };

  // Resolve skills for a question text. Priority order:
  //   1. Text scan against JD skill names — PREFERRED because Bina's
  //      actual question wording is the ground truth for "what was asked",
  //      and the planner-side assigned_skills frequently drift when the LLM
  //      ignores the slot rule (observed: Q2 planned for "Semantic Search /
  //      LLMs / AI Agents" but Bina asked about "NLP pipelines / BERT /
  //      Hugging Face" — the displayed skills should match the question).
  //   2. Planner snapshot (question_history.assigned_skills) — fallback
  //      when the question text contains no recognizable JD skill names
  //      (e.g. a generic transition Q, or a Q-text whose skill mentions
  //      use non-canonical wording).
  const resolveSkills = (questionText: string): string[] => {
    if (jdSkillNames.length > 0) {
      const fromText = findSkillsInText(questionText, jdSkillNames);
      if (fromText.length > 0) return fromText;
    }
    const fromHistory = skillsByText.get(questionText.trim().toLowerCase());
    if (fromHistory && fromHistory.length > 0) return fromHistory;
    return [];
  };

  const buildAndScore = (qText: string): {
    skills: PerQuestionSkill[];
    score: number;
  } => {
    const skills = buildSkillRows(qText, resolveSkills(qText));
    return { skills, score: computeQuestionScore(skills) };
  };

  const out: PerQuestionDetail[] = [];
  let qNum = 0;
  let pending: { question: string } | null = null;

  for (const m of cleaned) {
    if (m.role === 'assistant') {
      if (pending) {
        // Previous assistant had no user response — emit it as a Q with
        // empty answer so the recruiter sees the question that was asked.
        const { skills, score } = buildAndScore(pending.question);
        out.push({
          qNum: ++qNum,
          section: resolveSection(pending.question),
          question: pending.question,
          answer: '',
          skills,
          questionScore: score,
          bundledFollowUp: bundledForQuestion(pending.question),
          scoreRationale: rationaleForQuestion(pending.question),
        });
      }
      pending = { question: String(m.content) };
    } else if (m.role === 'user' && pending) {
      const { skills, score } = buildAndScore(pending.question);
      out.push({
        qNum: ++qNum,
        section: resolveSection(pending.question),
        question: pending.question,
        answer: String(m.content),
        skills,
        questionScore: score,
        bundledFollowUp: bundledForQuestion(pending.question),
        scoreRationale: rationaleForQuestion(pending.question),
      });
      pending = null;
    }
    // user message without pending assistant: ignore (orphan)
  }
  // Trailing assistant message without a response
  if (pending) {
    const { skills, score } = buildAndScore(pending.question);
    out.push({
      qNum: ++qNum,
      section: resolveSection(pending.question),
      question: pending.question,
      answer: '',
      skills,
      questionScore: score,
      bundledFollowUp: bundledForQuestion(pending.question),
      scoreRationale: rationaleForQuestion(pending.question),
    });
  }

  return out;
}

/**
 * Legacy per-question builder — drives off skill_question_map (reverse
 * index) + question_groups. Used only for interviews predating the
 * assigned_skills preservation fix, where question_history rows lack the
 * slot-plan snapshot. Suffers from the documented issues (single-skill
 * attribution per question, safety-net phantom skills polluting the list,
 * missing rows for questions with no skill_question_map entry).
 */
function buildPerQuestionDetailsLegacy(
  eval_: any,
  clusterPriorityBySkill: Record<string, Level> = {},
): PerQuestionDetail[] {
  const skillQMap = (eval_?.skill_question_map || {}) as Record<
    string,
    Array<{ q_num: number; score: number; note?: string }>
  >;
  const questionScores = (eval_?.question_scores || {}) as Record<string | number, number>;
  // skill_priority_map is the SECTION map ("must_have" | "nice_to_have" | "hr"),
  // NOT the priority. It's a misnomer in the backend payload. Real per-skill
  // P1/P2/P3 priority comes from the cluster the skill lives in — passed in
  // here as `clusterPriorityBySkill` so the per-question breakdown shows the
  // same priority chip as the Skills Assessment Summary tab.
  const groups = (eval_?.question_groups || []) as Array<any>;

  // q_num (1-based display index) → { section, question, answer }
  const qMeta: Record<number, { section: PerQuestionDetail['section']; question: string; answer: string }> = {};
  groups.forEach((g, idx) => {
    const display = idx + 1;
    const rt = String(g?.round_type || '').toLowerCase();
    let section: PerQuestionDetail['section'] = 'mth';
    if (rt === 'nice_to_have_skills') section = 'nth';
    else if (rt === 'hr') section = 'hr';
    qMeta[display] = {
      section,
      question: String(g?.question || g?.main_question || ''),
      answer: String(g?.answer || g?.main_answer || ''),
    };
  });

  // Reverse skill_question_map → per-question skill rows
  const perQ: Record<number, PerQuestionSkill[]> = {};
  for (const [topic, rows] of Object.entries(skillQMap || {})) {
    const priority = clusterPriorityBySkill[topic.toLowerCase().trim()] || 'Medium';
    const weight = PRIORITY_WEIGHT[priority];
    for (const r of rows || []) {
      const q = Number(r?.q_num || 0);
      if (!q) continue;
      const score = Math.max(0, Math.min(10, Number(r?.score) || 0));
      (perQ[q] = perQ[q] || []).push({
        name: topic,
        priority,
        weight,
        score: Math.round(score * 10) / 10,
        note: String(r?.note || '').slice(0, 250),
      });
    }
  }

  // Sort skills within each question by weight desc (High→Low) so the
  // breakdown reads top-down by importance — matches the doc example.
  Object.values(perQ).forEach(rows => rows.sort((a, b) => b.weight - a.weight || b.score - a.score));

  return Object.entries(perQ)
    .map(([qStr, skills]): PerQuestionDetail => {
      const qNum = Number(qStr);
      const meta = qMeta[qNum] || { section: 'mth' as const, question: '', answer: '' };
      const qsRaw = questionScores[qNum] ?? questionScores[String(qNum)];
      const questionScore = typeof qsRaw === 'number'
        ? Math.round(qsRaw * 10) / 10
        : 0;
      return {
        qNum,
        section: meta.section,
        question: meta.question,
        answer: meta.answer,
        skills,
        questionScore,
      };
    })
    .sort((a, b) => a.qNum - b.qNum);
}

function formatDurationMinutes(min: number): string {
  if (!min || min < 1) return `${Math.round((min || 0) * 60)}s`;
  if (min < 60) return `${Math.round(min * 10) / 10} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

/** Main entry point. */
export function buildDashboardData(params: {
  ai_evaluation: any;
  cluster_config: ClusterConfig;
  candidate: { name: string; role?: string; email?: string };
  interview: { mode?: string; completed_at?: string | null; created_at?: string };
  /** Per-round budget from the session row. Used to derive plannedCounts
   *  (denominator for Section Score per spec). When absent, plannedCounts
   *  fall back to 0 and the consumer can use delivered count instead. */
  rounds_config?: Array<{ type?: string; planned_questions?: number; enabled?: boolean }>;
  /** Raw chat log (assistant/user messages) — flows through to the Question
   *  Analysis builder as a fallback when question_history is sparse. Same
   *  source the Transcript view renders from. Caller should pass
   *  liveSession.conversation_transcript ?? interview.conversation_transcript. */
  conversation_transcript?: any[];
  /** Raw special_instructions JSON string from the session row. Used to
   *  extract `mth_question_skill_map` + `nth_question_skill_map` so the
   *  Question Analysis tab can display the SAME skills per slot as the
   *  Question Distribution UI — strictly, no extras. Per recruiter spec
   *  2026-05-20. */
  special_instructions?: string | null;
}): DashboardData {
  const { ai_evaluation: eval_, cluster_config, candidate, interview, rounds_config, conversation_transcript, special_instructions } = params;
  const isPartialEval = eval_?.partial === true || eval_?.evaluation_incomplete === true;

  // Planned question counts per section — feeds the Question Analysis page's
  // section-score denominator. Sum across all enabled rounds matching each
  // type (multi-round configurations are rare but supported).
  const plannedCounts = (() => {
    let mh = 0, nh = 0;
    for (const r of (rounds_config || [])) {
      if (r?.enabled === false) continue;
      const t = String(r?.type || '').toLowerCase();
      const pq = Number(r?.planned_questions) || 0;
      if (pq <= 0) continue;
      if (t === 'must_have_skills') mh += pq;
      else if (t === 'nice_to_have_skills') nh += pq;
    }
    return { mustHave: mh, niceToHave: nh };
  })();

  const mustHaveClusters = buildClustersFromConfig(cluster_config?.mth || [], eval_, 1);
  const niceToHaveClusters = buildClustersFromConfig(
    cluster_config?.nth || [],
    eval_,
    mustHaveClusters.length + 1,
  );

  // Section scores: prefer backend `section_question_avg` (simple average of
  // per-question scores, 0-10 — drives the recruiter Pass/Fail per spec).
  // Fall back to cluster-weighted derivation when backend hasn't supplied it.
  const mthQAvg = eval_?.section_question_avg?.mth;
  const nthQAvg = eval_?.section_question_avg?.nth;
  const mthBackend = eval_?.section_scores?.mth?.score;
  const nthBackend = eval_?.section_scores?.nth?.score;
  const mustHaveAvg = (typeof mthQAvg === 'number')
    ? Math.round(mthQAvg * 100) / 100
    : (mustHaveClusters.length > 0
        ? Math.round(mustHaveClusters.reduce((a, c) => a + c.clusterScore * c.weight / 100, 0) * 100) / 100
        : (typeof mthBackend === 'number' && mthBackend > 0 ? Math.round(mthBackend) / 10 : 0));
  const niceToHaveAvg = (typeof nthQAvg === 'number')
    ? Math.round(nthQAvg * 100) / 100
    : (niceToHaveClusters.length > 0
        ? Math.round(niceToHaveClusters.reduce((a, c) => a + c.clusterScore * c.weight / 100, 0) * 100) / 100
        : (typeof nthBackend === 'number' && nthBackend > 0 ? Math.round(nthBackend) / 10 : 0));
  const hr = hrScoreFromEval(eval_);

  // Determine which sections actually exist in this interview
  const sectionsPresent = {
    mustHave: mustHaveClusters.length > 0 || mustHaveAvg > 0,
    niceToHave: niceToHaveClusters.length > 0 || niceToHaveAvg > 0,
    hr: hr > 0 || !!eval_?.section_scores?.hr,
  };

  // Base weights — HR is excluded from scoring evaluation per product spec,
  // so its base weight is 0. Remaining 100% splits between MTH and NTH.
  // Renormalize to sum to 100 based on which sections actually exist.
  const BASE_MTH = 70, BASE_NTH = 30, BASE_HR = 0;
  const baseSum =
    (sectionsPresent.mustHave   ? BASE_MTH : 0) +
    (sectionsPresent.niceToHave ? BASE_NTH : 0) +
    (sectionsPresent.hr         ? BASE_HR  : 0);
  const weights = {
    mustHave:   sectionsPresent.mustHave   && baseSum > 0 ? (BASE_MTH / baseSum) * 100 : 0,
    niceToHave: sectionsPresent.niceToHave && baseSum > 0 ? (BASE_NTH / baseSum) * 100 : 0,
    hr:         sectionsPresent.hr         && baseSum > 0 ? (BASE_HR  / baseSum) * 100 : 0,
  };

  // Final score = (MHS × w_mth + NHS × w_nth + HR × w_hr) — where weights are
  // fractional (w/100). Each section score is 0-10, so × 10 at the end scales
  // the total to 0-100. Round to 1 decimal.
  const weightedSum =
    mustHaveAvg   * (weights.mustHave   / 100) +
    niceToHaveAvg * (weights.niceToHave / 100) +
    hr            * (weights.hr         / 100);
  const finalScore = Math.round(weightedSum * 100) / 10;

  const summary = eval_?.interview_summary || {};
  const rawRec = summary?.hiring_recommendation;
  // Backend now emits `final_result: "Pass" | "Fail"` derived from MHS section
  // average (≥6.0 → Pass). Treat it as the authoritative gate when available
  // and map onto the existing recommendation enum (Pass → Hire, Fail → No Hire)
  // so downstream UI/PDF rendering keep working without schema churn.
  const backendFinal = (eval_?.final_result || '').toString().toLowerCase();
  const recommendation: Recommendation =
    backendFinal === 'pass' ? 'Hire'
    : backendFinal === 'fail' ? 'No Hire'
    : recommendationFromString(rawRec, finalScore);

  const strengths: string[] = Array.isArray(summary?.key_strengths)
    ? summary.key_strengths
    : Array.isArray(eval_?.strengths) ? eval_.strengths : [];
  const weaknesses: string[] = Array.isArray(summary?.key_concerns)
    ? summary.key_concerns
    : Array.isArray(eval_?.weaknesses) ? eval_.weaknesses : [];
  const aiSummary: string = summary?.summary
    || summary?.narrative_insight
    || eval_?.narrative_insight
    || eval_?.capability_score_reasoning
    || '';

  const dateISO = interview.completed_at || interview.created_at || '';
  const dateStr = dateISO ? new Date(dateISO).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const modeNormalized = (interview.mode || '').toLowerCase();
  const mode: 'Timed' | 'Conversational' = modeNormalized === 'fixed' ? 'Timed' : 'Conversational';

  // ── Timed-mode doc-spec result (MHS section_question_avg ≥ 6.0 → Pass) ──
  // backendFinal already normalised above ('pass'/'fail'/'') — prefer it.
  // Fall back to recomputing locally so older sessions without `final_result`
  // still render a Pass/Fail when MHS data is available.
  const MHS_THRESHOLD = 6.0;
  let finalResult: 'Pass' | 'Fail' | null = null;
  if (backendFinal === 'pass') finalResult = 'Pass';
  else if (backendFinal === 'fail') finalResult = 'Fail';
  else if (typeof mthQAvg === 'number') {
    finalResult = mthQAvg >= MHS_THRESHOLD ? 'Pass' : 'Fail';
  }

  const questionScoresRaw = (eval_?.question_scores || {}) as Record<string | number, number>;
  const questionScores: Record<number, number> = {};
  for (const [k, v] of Object.entries(questionScoresRaw)) {
    const n = Number(k);
    if (Number.isFinite(n) && typeof v === 'number') {
      questionScores[n] = Math.round(v * 10) / 10;
    }
  }

  // Build skill → cluster priority map so the Question-by-Question breakdown
  // shows the same P1/P2/P3 chip as the Skills Assessment Summary (same skill
  // can't appear as P1 in one tab and P2 in another). Also collect the
  // canonical (original-cased) JD skill name for each lowercased key so the
  // per-Q breakdown can normalize the evaluator's (often abbreviated) topic
  // strings back to the JD wording the rest of the UI uses.
  const clusterPriorityBySkill: Record<string, Level> = {};
  const clusterCanonicalNameBySkill: Record<string, string> = {};
  for (const c of [...mustHaveClusters, ...niceToHaveClusters]) {
    for (const s of c.skills) {
      const key = (s.name || '').toLowerCase().trim();
      if (key) {
        clusterPriorityBySkill[key] = c.priority;
        if (!clusterCanonicalNameBySkill[key]) clusterCanonicalNameBySkill[key] = s.name;
      }
    }
  }
  const perQuestionDetailsRaw = buildPerQuestionDetails(
    eval_,
    clusterPriorityBySkill,
    clusterCanonicalNameBySkill,
    conversation_transcript || [],
  );

  // ── Strict Question-Distribution alignment ─────────────────────────────
  // Recruiter spec (2026-05-20): the Question Analysis tab MUST show the
  // exact set of skills configured for each slot in the Question
  // Distribution UI. No keyword-scan extras, no evaluator topic extras,
  // no leftovers from older buggy `assigned_skills` writes.
  //
  // Source: `special_instructions.mth_question_skill_map[]` and
  // `nth_question_skill_map[]` — same DB-backed plan the Question
  // Distribution UI reads. Each row carries `primary_skill` +
  // `secondary_skills` for that slot.
  //
  // Mapping: history rows are bucketed by section, sorted by qNum
  // ascending; the i-th row in MTH maps to MTH slot (i+1), same for NTH.
  // For HR, no skill plan exists (HR is question-bank-text-based), so
  // HR rows keep their existing (likely empty) skills list.
  //
  // When `special_instructions` is missing/malformed or no plan exists
  // for a slot, the row's existing `skills` is preserved as fallback —
  // older interviews predate this snapshot and shouldn't regress.
  const parsedSpecialInstructions = (() => {
    if (!special_instructions || typeof special_instructions !== 'string') return null;
    try {
      const p = JSON.parse(special_instructions);
      return p && typeof p === 'object' ? p : null;
    } catch {
      return null;
    }
  })();
  const planRowsBySection: Record<'mth' | 'nth', any[]> = { mth: [], nth: [] };
  if (parsedSpecialInstructions) {
    const mth = Array.isArray(parsedSpecialInstructions.mth_question_skill_map)
      ? parsedSpecialInstructions.mth_question_skill_map
      : [];
    const nth = Array.isArray(parsedSpecialInstructions.nth_question_skill_map)
      ? parsedSpecialInstructions.nth_question_skill_map
      : [];
    planRowsBySection.mth = [...mth].sort((a, b) =>
      (Number(a?.question_number) || 0) - (Number(b?.question_number) || 0),
    );
    planRowsBySection.nth = [...nth].sort((a, b) =>
      (Number(a?.question_number) || 0) - (Number(b?.question_number) || 0),
    );
  }
  const buildSkillsFromPlanRow = (row: any): PerQuestionSkill[] => {
    if (!row) return [];
    const primary = String(row?.primary_skill || '').trim();
    const secs = Array.isArray(row?.secondary_skills)
      ? row.secondary_skills.filter((s: any) => typeof s === 'string' && s.trim())
      : [];
    const names: string[] = [];
    if (primary) names.push(primary);
    for (const s of secs) names.push(s);
    // Case-insensitive dedupe.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const n of names) {
      const k = n.toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      unique.push(n);
    }
    return unique.map(name => {
      const priority = clusterPriorityBySkill[name.toLowerCase().trim()] || 'Medium';
      return {
        name,
        priority,
        weight: PRIORITY_WEIGHT[priority],
        score: 0,
        note: '',
      };
    });
  };

  // ── Per-section cap: enforce the configured plan size ────────────────

  // ── Per-section cap: enforce the configured plan size ────────────────
  // Recruiter spec (2026-05-20): Question Analysis shows EXACTLY the
  // planned questions — no excess rows from inflated counters, burst
  // re-emissions, or evaluator follow-up bookkeeping. If the backend
  // recorded N > planned for a section (defensive against any residual
  // drift after Phase 1+2 deploy), trim to the first `planned` entries
  // per section in chronological order (qNum ascending).
  //
  // Cap source priority:
  //   1. `eval_.round_tracking[].planned_questions` (most authoritative —
  //      reflects what the runtime actually targeted).
  //   2. `rounds_config[].planned_questions` (config snapshot fallback).
  // When neither has a positive value for a section, that section is
  // left uncapped (won't filter anything out by accident).
  const sectionCap: { mth: number | null; nth: number | null; hr: number | null } = {
    mth: null, nth: null, hr: null,
  };
  const sectionKey = (rt: string): keyof typeof sectionCap | null => {
    const t = (rt || '').toLowerCase();
    if (t === 'must_have_skills') return 'mth';
    if (t === 'nice_to_have_skills') return 'nth';
    if (t === 'hr') return 'hr';
    return null;
  };
  for (const rt of (eval_?.round_tracking || [])) {
    const k = sectionKey(rt?.type);
    if (!k) continue;
    const pq = Number(rt?.planned_questions);
    if (Number.isFinite(pq) && pq > 0) sectionCap[k] = pq;
  }
  for (const r of (rounds_config || [])) {
    if (r?.enabled === false) continue;
    const k = sectionKey(r?.type);
    if (!k) continue;
    if (sectionCap[k] !== null) continue; // round_tracking already gave us one
    const pq = Number(r?.planned_questions);
    if (Number.isFinite(pq) && pq > 0) sectionCap[k] = pq;
  }
  const perQuestionDetails: PerQuestionDetail[] = (() => {
    const buckets: Record<'mth' | 'nth' | 'hr', PerQuestionDetail[]> = { mth: [], nth: [], hr: [] };
    for (const row of perQuestionDetailsRaw) {
      buckets[row.section].push(row);
    }
    // Chronological order (qNum ascending) so the first N planned are kept,
    // not arbitrary tail entries from burst/duplicate noise.
    for (const key of ['mth', 'nth', 'hr'] as const) {
      buckets[key].sort((a, b) => a.qNum - b.qNum);
      const cap = sectionCap[key];
      if (cap !== null && buckets[key].length > cap) {
        console.warn(
          `[QuestionAnalysis] ${key.toUpperCase()} has ${buckets[key].length} rows but plan = ${cap}; trimming excess.`,
        );
        buckets[key] = buckets[key].slice(0, cap);
      }
    }

    // ── Override skills with the Question Distribution plan ─────────
    // For each row in MTH/NTH, replace `skills` with the planned slot's
    // [primary, ...secondaries] from special_instructions. Scores are
    // preserved by matching plan-skill names against the original row's
    // skills (case-insensitive); any plan skill not found in the row
    // falls back to the row's questionScore with the Q badge — same
    // policy as the per-skill score path.
    const applyPlanForSection = (
      section: 'mth' | 'nth',
      planRows: any[],
      rows: PerQuestionDetail[],
      // Retained for call-site compatibility; the join no longer uses a
      // positional offset (the index join it fed was the wrong-slot source).
      _sectionOffset: number = 0,
    ): PerQuestionDetail[] => {
      if (planRows.length === 0) return rows;
      // ONE plan slot ↔ ONE question row. `usedSlots` tracks slots already
      // claimed so a slot's skills can NEVER be painted onto more than one
      // question — that reuse was the "same skill repeats across many questions"
      // bug. Slots bind by skill-identity first (order-independent), else by the
      // NEXT-UNUSED slot in plan order — both mirror the Question Distribution
      // popover (which the recruiter confirms is correct) and cannot duplicate
      // or cross-pull a slot.
      const usedSlots = new Set<any>();
      return rows.map((row) => {
        // Pair each row with its plan slot by SKILL IDENTITY — NOT by positional
        // arithmetic. `row.qNum` is the backend GLOBAL ask-order question_number,
        // while the plan's `question_number` is the round-robin (P1/P2/P3)
        // renumbered order from _apply_cross_priority_mix. Those two axes diverge
        // whenever a global slot is consumed before/among the skill questions (an
        // opening HR/greeting slot, a skip, or a follow-up) or a slot is asked out
        // of renumbered order — so the old `globalQ - sectionOffset` →
        // planByQnum.get(slotNum) join returned a DIFFERENT slot's skill (e.g. the
        // STLC question showing Q3's "communication" skill). The backend already
        // bound the CORRECT plan skills to this row (assigned_skills /
        // question_skill_map on the SAME ask-order axis as the text), so recover
        // the slot by best skill-set overlap, which is order-independent and
        // deterministic because plan slots carry disjoint skills.
        const rowSkillSet = new Set(
          row.skills.map(s => String(s?.name || '').toLowerCase().trim()).filter(Boolean),
        );
        let planRow: any = null;
        if (rowSkillSet.size > 0) {
          let bestScore = 0;
          for (const pr of planRows) {
            if (usedSlots.has(pr)) continue; // a slot binds to only one question
            const prPrimary = String(pr?.primary_skill || '').toLowerCase().trim();
            const prSecs = (Array.isArray(pr?.secondary_skills) ? pr.secondary_skills : [])
              .map((s: any) => String(s || '').toLowerCase().trim())
              .filter(Boolean);
            let overlap = 0;
            for (const n of [prPrimary, ...prSecs]) {
              if (n && rowSkillSet.has(n)) overlap++;
            }
            // Weight a primary-skill match higher so the owning slot wins ties.
            const scoreVal = overlap * 2 + (prPrimary && rowSkillSet.has(prPrimary) ? 1 : 0);
            if (scoreVal > bestScore) {
              bestScore = scoreVal;
              planRow = pr;
            }
          }
        }
        // Fallback (row skills didn't overlap any UNUSED slot — zero-overlap /
        // legacy rows): take the NEXT UNUSED plan slot in plan order.
        // Deterministic, unique, and matches the Distribution popover. The old
        // `globalQ - sectionOffset` / planRows[idx] join pulled an arbitrary,
        // possibly-already-shown slot — the wrong/duplicate-mapping source.
        if (!planRow) {
          planRow = planRows.find(pr => !usedSlots.has(pr)) ?? null;
        }
        if (!planRow) return row;
        usedSlots.add(planRow); // consume: never reuse this slot for another row
        const planSkills = buildSkillsFromPlanRow(planRow);
        if (planSkills.length === 0) return row;
        // Index existing per-skill scores from the original row.
        const existingByName: Record<string, PerQuestionSkill> = {};
        for (const s of row.skills) {
          existingByName[s.name.toLowerCase().trim()] = s;
        }
        const isSkippedRow = (row.skills.some(s => s.is_skipped)) ||
          (!row.answer || !row.answer.trim());
        const qScore = row.questionScore;
        const replacedSkills: PerQuestionSkill[] = planSkills.map(ps => {
          const match = existingByName[ps.name.toLowerCase().trim()];
          if (match) {
            // Preserve original per-skill score + flags exactly.
            return { ...match, priority: ps.priority, weight: ps.weight };
          }
          // No direct match — derive a sensible score:
          //   • Skipped row → 0 with Skipped badge
          //   • Otherwise → Q-fallback at the question's overall score
          if (isSkippedRow) {
            return { ...ps, score: 0, is_skipped: true };
          }
          if (qScore > 0) {
            return {
              ...ps,
              score: Math.round(qScore * 10) / 10,
              is_fallback: true,
            };
          }
          return ps; // score 0, no flags
        });
        return { ...row, skills: replacedSkills };
      });
    };
    // MHS offset = 0 (starts at global Q1).
    // NHS offset = planned MHS count so slot 9 → section-local 1, etc.
    const mthOffset = 0;
    const nthOffset = sectionCap.mth ?? 0;
    buckets.mth = applyPlanForSection('mth', planRowsBySection.mth, buckets.mth, mthOffset);
    buckets.nth = applyPlanForSection('nth', planRowsBySection.nth, buckets.nth, nthOffset);
    // HR rows keep their existing skills (HR is bank-text-based; no plan).

    // ── Renumber qNum to clean 1-based section-local index ──────────
    // Recruiter spec 2026-05-21: Question Analysis Q-numbers must
    // match the Question Distribution UI exactly — Q1-Q8 in MTH,
    // Q1-Q4 in NTH, Q1-Q3 in HR. Previous behavior used `_historyIdx`
    // (raw history-array position), which produced gaps like
    // "MTH Q1, Q2, Q3, Q4, Q5, Q6, Q15, Q16" when buffer-mode rows
    // crept into the data (observed: kanimozhi's session, 21 rows
    // for a 15-Q interview with q_nums 1-22). After sort+cap, the
    // displayed slot numbers should mirror the plan slot numbers.
    // This also makes Analysis Q5 = Question Distribution slot 5,
    // so the recruiter cross-references map 1:1.
    for (const key of ['mth', 'nth', 'hr'] as const) {
      buckets[key] = buckets[key].map((row, idx) => ({ ...row, qNum: idx + 1 }));
    }

    return [...buckets.mth, ...buckets.nth, ...buckets.hr];
  })();

  // ── Skip-reason annotation ──────────────────────────────────────────────
  // For questions with no real answer, attach HOW it was skipped (candidate
  // "Next Question" vs "Are you there?" silence vs timer) so the Question
  // Analysis answer block can differentiate them, matching the Transcript tab.
  // Same derivation (buildSkipReasoner): transcript-sequence first, skip_source
  // as enhancement. "answered" is decided here from the row's answer text +
  // responseType, mirroring EvaluationDashboardV2's noRealAnswer rule.
  {
    const _reasoner = buildSkipReasoner(conversation_transcript || [], (eval_?.question_history as any[]) || []);
    for (const _row of perQuestionDetails) {
      const _rt = (_row.responseType || '').toLowerCase();
      const _ans = (_row.answer || '').trim();
      const _noRealAnswer = !_ans
        || _ans.toLowerCase() === '[skipped]'
        || ['skipped', 'not_answered', 'timeout', 'low_coverage', 'idk'].includes(_rt);
      if (_noRealAnswer) {
        const _reason = _reasoner(_row.question || '', false);
        if (_reason) _row.skipReason = _reason;
      }
    }
  }

  // ── Clarification annotation ────────────────────────────────────────────
  // Attach the clarification turns ("Clarify"/CL1, CL2…) that fired within
  // each question's slot, derived from the raw conversation_transcript and
  // grouped under their parent question — exactly how the Transcript tab
  // surfaces them. Without this the Question Analysis tab silently dropped
  // every clarification (it builds from question_history, which has no
  // clarification rows). Match by question text (fuzzy, like the skip
  // reasoner) so plan-remapped skills don't break the association.
  {
    const _getClar = buildClarificationsByQuestion(conversation_transcript || []);
    for (const _row of perQuestionDetails) {
      const _clars = _getClar(_row.question || '');
      if (_clars.length > 0) _row.clarifications = _clars;
    }
  }

  // ── Derive ALL scores from perQuestionDetails (single source of truth) ──
  // Question Analysis is always correct because it aligns each question's
  // skills/scores to the saved distribution plan. Overview, Eval Report,
  // and Skill Breakdown used to pull from skill_scores_map / evaluations[]
  // which don't align to the plan — causing the "Overview wrong, QA right"
  // discrepancy. Rebuilding everything from perQuestionDetails guarantees
  // all four tabs show identical numbers.

  // 1. Per-skill score map — take the first non-skipped/non-unscored score
  //    for each skill; fall back to the first occurrence if all are skipped.
  const qaSkillScore = new Map<string, number>();
  for (const qRow of perQuestionDetails) {
    for (const sk of qRow.skills) {
      const key = (sk.name || '').toLowerCase().trim();
      if (!key) continue;
      if (!qaSkillScore.has(key)) {
        // Seed with whatever is here; will be upgraded by a good score below.
        qaSkillScore.set(key, sk.is_unscored || sk.is_skipped ? 0 : (sk.score ?? 0));
      } else if (!sk.is_unscored && !sk.is_skipped && sk.score > 0) {
        // Overwrite with the first real score we encounter.
        qaSkillScore.set(key, sk.score);
      }
    }
  }

  // 2. Rebuild cluster skill scores and cluster averages from QA map.
  const rebuildClustersFromQA = (clusters: Cluster[]): Cluster[] =>
    clusters.map(cluster => {
      const updatedSkills: Skill[] = cluster.skills.map(sk => {
        const qaScore = qaSkillScore.get((sk.name || '').toLowerCase().trim());
        return typeof qaScore === 'number' ? { ...sk, score: qaScore } : sk;
      });
      const scoredSkills = updatedSkills.filter(sk => sk.score > 0);
      const newClusterScore = scoredSkills.length > 0
        ? Math.round(scoredSkills.reduce((sum, sk) => sum + sk.score, 0) / scoredSkills.length * 100) / 100
        : 0;
      return { ...cluster, skills: updatedSkills, clusterScore: newClusterScore };
    });

  const mustHaveClustersQA  = rebuildClustersFromQA(mustHaveClusters);
  const niceToHaveClustersQA = rebuildClustersFromQA(niceToHaveClusters);

  // 3. Section averages = simple average of every question that was evaluated
  //    (not isUnscored). MUST match QuestionsView's per-section math exactly,
  //    otherwise the headline numbers in Overview / Skill Breakdown / Eval
  //    Report diverge from the per-Q badges the recruiter sees in Question
  //    Analysis. The old `questionScore > 0` filter dropped answered questions
  //    that scored a hard 0.0, inflating these tabs relative to Q Analysis.
  const mthQARows = perQuestionDetails.filter(q => q.section === 'mth' && !q.isUnscored);
  const nthQARows = perQuestionDetails.filter(q => q.section === 'nth' && !q.isUnscored);

  // Round to 1 decimal — matches QuestionsView (mhScore/nhScore) so the
  // headline numbers in Overview / Skill Breakdown / Eval Report agree with
  // the per-section badge inside Question Analysis. Keeping 2-decimal here
  // was producing rendered mismatches like 6.95 (Overview) vs 7.00 (Q Analysis).
  // PERMANENT FIX (2026-06-02): prefer the BACKEND authoritative section
  // averages (`section_question_avg.mth/nth`) — the SAME values the Results-list
  // score (capability_score = mth×10 in timed mode) and Pass/Fail derive from.
  // Recomputing the Must-Have average independently from the QA rows here is
  // what made the report headline (e.g. 10%) disagree with the Results list
  // (e.g. 36%) for the same candidate. Fall back to the QA recompute only for
  // legacy sessions that never stored section_question_avg.
  const mustHaveAvgQA = (typeof mthQAvg === 'number')
    ? mthQAvg
    : (mthQARows.length > 0
        ? Math.round(mthQARows.reduce((s, q) => s + q.questionScore, 0) / mthQARows.length * 10) / 10
        : mustHaveAvg); // keep original if QA produced no scored rows (old sessions)

  const niceToHaveAvgQA = (typeof nthQAvg === 'number')
    ? nthQAvg
    : (nthQARows.length > 0
        ? Math.round(nthQARows.reduce((s, q) => s + q.questionScore, 0) / nthQARows.length * 10) / 10
        : niceToHaveAvg);

  // 4. Final score from QA-derived section averages.
  //    TIMED mode: the headline "Match Score" is Must-Have Section Score ×10
  //    ONLY — Nice-to-Have is informational and HR isn't scored, per the
  //    timed-eval spec. This makes the report headline equal the backend's
  //    stored score shown in the Results list (both MHS×10), fixing the
  //    36% (list) vs 45% (report) mismatch. Conversational mode keeps the
  //    section-weighted blend.
  const weightedSumQA =
    mustHaveAvgQA   * (weights.mustHave   / 100) +
    niceToHaveAvgQA * (weights.niceToHave / 100) +
    hr              * (weights.hr         / 100);
  const finalScoreQA = (mode === 'Timed' && sectionsPresent.mustHave)
    ? Math.round(mustHaveAvgQA * 100) / 10
    : Math.round(weightedSumQA * 100) / 10;

  // 5. Pass/Fail from QA-derived MHS average (prefer backend authoritative).
  let finalResultQA: 'Pass' | 'Fail' | null = null;
  if (!isPartialEval) {
    if (backendFinal === 'pass') finalResultQA = 'Pass';
    else if (backendFinal === 'fail') finalResultQA = 'Fail';
    else if (mustHaveAvgQA > 0) finalResultQA = mustHaveAvgQA >= MHS_THRESHOLD ? 'Pass' : 'Fail';
    else finalResultQA = finalResult;
  }

  return {
    candidate: {
      name: candidate.name,
      role: candidate.role || 'Candidate',
      email: candidate.email,
    },
    interview: {
      mode,
      duration: formatDurationMinutes(eval_?.duration_minutes || 0),
      date: dateStr,
    },
    isPartialEvaluation: isPartialEval,
    scores: {
      mustHave:   Math.round(mustHaveAvgQA  * 100) / 100,
      niceToHave: Math.round(niceToHaveAvgQA * 100) / 100,
      hr:         Math.round(hr             * 100) / 100,
      final:      finalScoreQA,
    },
    weights: {
      mustHave: Math.round(weights.mustHave * 100) / 100,
      niceToHave: Math.round(weights.niceToHave * 100) / 100,
      hr: Math.round(weights.hr * 100) / 100,
    },
    sectionsPresent,
    strengths,
    weaknesses,
    aiSummary,
    recommendation,
    mustHaveClusters:  mustHaveClustersQA,
    niceToHaveClusters: niceToHaveClustersQA,
    interviewResponses: buildInterviewResponses(eval_),
    finalResult: finalResultQA,
    mhsThreshold: MHS_THRESHOLD,
    questionScores,
    perQuestionDetails,
    plannedCounts,
  };
}
