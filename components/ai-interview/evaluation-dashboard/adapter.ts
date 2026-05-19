// Adapter: transforms the backend's ai_evaluation + session config
// into the dashboard design's DashboardData shape.
//
// Cluster Name + Priority come DIRECTLY from the special_instructions config,
// not from the evaluator's output — that's the authoritative source.

import type {
  DashboardData, Cluster, Skill, Level, Recommendation, InterviewResponse,
  PerQuestionDetail, PerQuestionSkill,
} from './types';

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
    // Strongest signal: if the evaluator scored this skill above 0, it
    // was definitely probed — that score wouldn't exist otherwise.
    if (score010 > 0) return true;

    const sl = sname.toLowerCase();

    // Union semantics: a skill is "asked" if ANY authoritative source
    // says yes. Older approach used strict priority order and trusted
    // skill_assessed_map even when it was stale.
    if (hasAssessedMap) {
      for (const k of Object.keys(assessedMap)) {
        if (k.toLowerCase() === sl && assessedMap[k]) return true;
      }
    }
    if (assignedSkillSet.has(sl)) return true;

    if (!questionBlob) return false;
    for (const kw of keywordsForSkill(sname)) {
      if (wordBoundaryTest(kw, questionBlob)) return true;
    }
    return false;
  };

  // Weights always sum to exactly 100 so displayed math is consistent
  const weights = computeWeights(configClusters);

  return configClusters.map((cc, idx): Cluster => {
    const weight = weights[idx];

    const skills: Skill[] = (cc.skills || []).map((sname): Skill => {
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

  // Fallback to question_history
  const history = eval_?.question_history || [];
  return history.map((h: any, idx: number): InterviewResponse => ({
    id: idx + 1,
    timestamp: h.timestamp ? formatTimestamp(h.timestamp) : `Q${idx + 1}`,
    question: h.question_text || h.question || '',
    candidateResponse: h.response_text || h.answer || '',
    skillsCovered: [h.topic].filter(Boolean),
    duration: '—',
  }));
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
function buildPerQuestionDetails(
  eval_: any,
  clusterPriorityBySkill: Record<string, Level> = {},
  clusterCanonicalNameBySkill: Record<string, string> = {},
): PerQuestionDetail[] {
  // Drive from question_history.assigned_skills when present — that's the
  // planner snapshot (primary + secondaries the slot was meant to probe),
  // so every delivered question shows the FULL multi-skill row instead of
  // whichever single topic the LLM evaluator picked. Falls back to the
  // legacy skill_question_map path for older interviews that pre-date the
  // assigned_skills preservation fix (deejan's session etc.).
  const questionHistory = (eval_?.question_history || []) as any[];
  const hasAssignedSnapshot = questionHistory.some(
    q => Array.isArray(q?.assigned_skills) && q.assigned_skills.length > 0
  );
  if (hasAssignedSnapshot) {
    return buildPerQuestionDetailsFromHistory(eval_, clusterPriorityBySkill, clusterCanonicalNameBySkill);
  }
  return buildPerQuestionDetailsLegacy(eval_, clusterPriorityBySkill);
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

  // Group evaluations by question_number → list of skill-rows. A single
  // delivered question can have multiple eval rows (one per assigned
  // skill) under the multi-skill scoring scheme.
  const evalsByQ: Record<number, any[]> = {};
  for (const ev of evaluations) {
    const qn = Number(ev?.question_number || 0);
    if (!qn) continue;
    (evalsByQ[qn] = evalsByQ[qn] || []).push(ev);
  }

  // Per-skill score lookup: prefer exact topic match, fall back to substring.
  // Score 0 (with empty note) when the evaluator emitted no row for this skill.
  const scoreForSkill = (qn: number, skill: string): { score: number; note: string } => {
    const sl = skill.toLowerCase().trim();
    const rows = evalsByQ[qn] || [];
    const readScore = (r: any): number => {
      const raw = Number(r?.score ?? r?.evaluation?.overall ?? 0);
      return Math.max(0, Math.min(10, isFinite(raw) ? raw : 0));
    };
    const readNote = (r: any): string =>
      String(r?.one_line_note || r?.evaluation?.brief_note || '').slice(0, 250);

    for (const r of rows) {
      const topic = String(r?.topic || r?.evaluation?.topic || '').toLowerCase().trim();
      if (topic === sl) return { score: readScore(r), note: readNote(r) };
    }
    for (const r of rows) {
      const topic = String(r?.topic || r?.evaluation?.topic || '').toLowerCase().trim();
      if (topic && (topic.includes(sl) || sl.includes(topic))) {
        return { score: readScore(r), note: readNote(r) };
      }
    }
    return { score: 0, note: '' };
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
  const _skipResponseTypes = new Set([
    'skipped', 'not_asked', 'timeout', 'low_coverage',
    'auto_skipped_offline', 'auto_skipped_by_coverage',
  ]);
  const _seenDedupeKeys = new Set<string>();
  const mains = questionHistory.filter(q => {
    if (q?.is_follow_up) return false;
    const rt = String(q?.response_type || '').toLowerCase();
    if (rt === 'auto_skipped_by_coverage') return false;
    if (!q?.question || !String(q.question).trim()) return false;
    const _qText = String(q.question).trim().toLowerCase();
    const _rtKey = String(q?.round_type || '').toLowerCase();
    const _key = `${_rtKey}::${_qText}`;
    if (_skipResponseTypes.has(rt) && _seenDedupeKeys.has(_key)) return false;
    _seenDedupeKeys.add(_key);
    return true;
  });

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
    // Use the actual question_number from the transcript / history so the
    // Question Analysis tab aligns 1:1 with the Transcript view ("Q11" in
    // Transcript shows up as "Q11" in Analysis, not "Q4 NHS"). Falls back
    // to a sequential number when the row didn't carry one (legacy rows).
    const origQ = Number(q?.question_number || (idx + 1));
    const displayQ = origQ;
    const section = sectionFromRT(q?.round_type);
    const assigned: string[] = Array.isArray(q?.assigned_skills) ? q.assigned_skills : [];

    // Source priority for the displayed skill rows:
    //   1. Skills whose keywords appear in the actual question text
    //      (most accurate to "what did Linda ask about"). Linda's
    //      generated question often diverges from the planner's slot
    //      directive — e.g. slot 3 planned for "Oracle + Spring" but
    //      Linda asked about MongoDB/PostgreSQL/Prometheus instead.
    //      Both `assigned_skills` and `evaluations[].topic` would then
    //      surface the wrong skills.
    //   2. Evaluator's topic attribution (next best — what the LLM tagged
    //      after seeing the question).
    //   3. Planner snapshot (`assigned_skills`).
    //   4. `item.topic` (last-resort; backend pre-fills it with the next
    //      uncovered skill before evaluation, which is unreliable).
    const jdSkillNames = Object.values(clusterCanonicalNameBySkill);
    const fromText = findSkillsInText(String(q?.question || ''), jdSkillNames);

    const evalRows = evalsByQ[origQ] || [];
    const evalTopics: string[] = [];
    for (const r of evalRows) {
      const t = String(r?.topic || r?.evaluation?.topic || '').trim();
      if (t && t.toLowerCase() !== 'general') evalTopics.push(t);
    }

    let baseNames: string[];
    if (fromText.length > 0) {
      baseNames = fromText;
    } else if (evalTopics.length > 0) {
      baseNames = evalTopics.map(normalizeSkillName);
    } else if (assigned.length > 0) {
      baseNames = assigned;
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

    const skills: PerQuestionSkill[] = skillNames.map(skillName => {
      const priority = clusterPriorityBySkill[String(skillName).toLowerCase().trim()] || 'Medium';
      const weight = PRIORITY_WEIGHT[priority];
      const { score, note } = scoreForSkill(origQ, skillName);
      return {
        name: skillName,
        priority,
        weight,
        score: Math.round(score * 10) / 10,
        note,
      };
    });
    skills.sort((a, b) => b.weight - a.weight || b.score - a.score);

    // Weighted question score = Σ(score × weight) / Σ(weight). Prefer the
    // backend's stored entry.score when present so forced-to-zero overrides
    // (garbage-answer rule, etc.) survive into the display.
    const sumW = skills.reduce((s, k) => s + k.weight, 0);
    const sumWS = skills.reduce((s, k) => s + k.score * k.weight, 0);
    const weighted = sumW > 0 ? sumWS / sumW : 0;
    const entryScore = typeof q?.score === 'number' ? q.score : null;
    const questionScore = entryScore !== null
      ? Math.round(entryScore * 10) / 10
      : Math.round(weighted * 10) / 10;

    return {
      qNum: displayQ,
      section,
      question: String(q?.question || ''),
      answer: String(q?.answer || ''),
      skills,
      questionScore,
    };
  });
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
}): DashboardData {
  const { ai_evaluation: eval_, cluster_config, candidate, interview, rounds_config } = params;

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

  // ── Timed-mode doc-spec result (MHS section_question_avg ≥ 7.0 → Pass) ──
  // backendFinal already normalised above ('pass'/'fail'/'') — prefer it.
  // Fall back to recomputing locally so older sessions without `final_result`
  // still render a Pass/Fail when MHS data is available.
  const MHS_THRESHOLD = 7.0;
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
  const perQuestionDetails = buildPerQuestionDetails(eval_, clusterPriorityBySkill, clusterCanonicalNameBySkill);

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
    scores: {
      mustHave: Math.round(mustHaveAvg * 100) / 100,
      niceToHave: Math.round(niceToHaveAvg * 100) / 100,
      hr: Math.round(hr * 100) / 100,
      final: finalScore,
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
    mustHaveClusters,
    niceToHaveClusters,
    interviewResponses: buildInterviewResponses(eval_),
    finalResult,
    mhsThreshold: MHS_THRESHOLD,
    questionScores,
    perQuestionDetails,
    plannedCounts,
  };
}
