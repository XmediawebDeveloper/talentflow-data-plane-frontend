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
  const filterToPlanned = hasAssignedSnapshot || hasAssessedMap;
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

  // Approximate Q count from conversation_transcript: count assistant
  // messages (each one is a Linda turn = one Q). Filter system messages.
  const convoQApprox = (conversationTranscript || []).filter(
    m => m?.role === 'assistant' && typeof m?.content === 'string' && m.content.trim()
  ).length;

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

  const buildSkillRows = (names: string[]): PerQuestionSkill[] =>
    names.map(name => {
      const priority = clusterPriorityBySkill[String(name).toLowerCase().trim()] || 'Medium';
      return {
        name,
        priority,
        weight: PRIORITY_WEIGHT[priority],
        score: 0,
        note: '',
      };
    });

  for (const g of groups) {
    const mainQ = String(g?.question || '');
    const mainA = String(g?.answer || '');
    const matched = historyByText.get(mainQ.trim().toLowerCase());

    // Main Q skills: prefer persisted assigned_skills (richer multi-skill
    // set), fall back to the group's single g.skill.
    let mainSkillNames: string[] = [];
    if (matched && Array.isArray(matched.assigned_skills) && matched.assigned_skills.length > 0) {
      mainSkillNames = matched.assigned_skills.filter(
        (s: any) => typeof s === 'string' && s.trim(),
      );
    } else if (typeof g?.skill === 'string' && g.skill.trim()) {
      mainSkillNames = [g.skill.trim()];
    }
    mainSkillNames = dedupeKeepCase(mainSkillNames);
    const section = sectionFromRT(matched?.round_type);

    out.push({
      qNum: nextQ++,
      section,
      question: mainQ,
      answer: mainA,
      skills: buildSkillRows(mainSkillNames),
      questionScore: typeof matched?.score === 'number'
        ? Math.round(matched.score * 10) / 10
        : 0,
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
      let fuSkillNames: string[] = [];
      if (fuMatched && Array.isArray(fuMatched.assigned_skills) && fuMatched.assigned_skills.length > 0) {
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

      out.push({
        qNum: nextQ++,
        section,
        question: fuQ,
        answer: fuA,
        skills: buildSkillRows(fuSkillNames),
        questionScore: typeof fuMatched?.score === 'number'
          ? Math.round(fuMatched.score * 10) / 10
          : 0,
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
  // Greeting filter: Linda's opening turn combines a brief intro with the
  // Q1 prompt — "Hi! I'm Linda, your AI interviewer..." — and the backend
  // tags it with MHS Q1's assigned skills. Per recruiter spec the greeting
  // should not occupy a graded slot — detect by text pattern (covers
  // "I'm Linda" / "I am Linda" in any case) rather than by question_number
  // because the reconnect-recovery path can stamp the greeting with an
  // inflated question_number.
  const _isGreeting = (q: any): boolean => {
    const txt = String(q?.question || '').toLowerCase();
    return /\bi['’]?\s*m\s+linda\b/.test(txt) || /\bi\s+am\s+linda\b/.test(txt);
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
  const mains = indexedHistory.filter(q => {
    if (_isGreeting(q)) return false;
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
  // history doesn't have a matching row for a turn, we scan Linda's question
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
  const _looksLikeHR = (q: string): boolean => {
    const t = (q || '').toLowerCase();
    return (
      /\btell me about yourself\b/.test(t)
      || /\bwhy do you want to (?:join|work)\b/.test(t)
      || /\bwhere do you see yourself\b/.test(t)
      || /\bwhat motivates you\b/.test(t)
      || /\bgreatest (?:strength|weakness|achievement)\b/.test(t)
      || /\bteam(work)? (?:experience|collaboration)\b/.test(t)
      || /\bdescribe a (?:conflict|challenge|difficult)\b/.test(t)
      || /\bsalary expectation/.test(t)
      || /\bnotice period\b/.test(t)
    );
  };
  const resolveSection = (questionText: string): PerQuestionDetail['section'] => {
    const txt = questionText.trim().toLowerCase();
    const fromHistory = roundTypeByText.get(txt);
    if (fromHistory) return sectionFromRT(fromHistory);
    if (_looksLikeHR(questionText)) return 'hr';
    return 'mth';
  };

  // Drop noise: system messages, empty content, Linda's meta-only chatter
  // (greeting prefixes with no follow-up question, closing thank-yous).
  // The transcript view filters the same way (CandidateResultsView.tsx
  // around line 2190 — `_isMetaAssistant`) so card count matches.
  const _isClosing = (c: string): boolean => {
    const t = c.toLowerCase();
    return (
      t.includes('thank you for completing the interview') ||
      t.includes('thank you for your time today') ||
      (t.includes('your responses have been recorded') && t.includes('wish you all the best'))
    );
  };
  const cleaned = (messages || []).filter(m =>
    m?.role !== 'system'
    && typeof m?.content === 'string'
    && m.content.trim()
    && !(m.role === 'assistant' && _isClosing(m.content))
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

  // Resolve skills for a question text:
  //   1. Exact-text match against question_history.assigned_skills (richest).
  //   2. Text scan against JD skill names (catches turns the backend never
  //      persisted to history — recruiter still sees what was probed).
  const resolveSkills = (questionText: string): string[] => {
    const fromHistory = skillsByText.get(questionText.trim().toLowerCase());
    if (fromHistory && fromHistory.length > 0) return fromHistory;
    if (jdSkillNames.length === 0) return [];
    const fromText = findSkillsInText(questionText, jdSkillNames);
    return fromText;
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
      section: 'mth',
      question: pending.question,
      answer: '',
      skills,
      questionScore: score,
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
}): DashboardData {
  const { ai_evaluation: eval_, cluster_config, candidate, interview, rounds_config, conversation_transcript } = params;

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
  const perQuestionDetails = buildPerQuestionDetails(
    eval_,
    clusterPriorityBySkill,
    clusterCanonicalNameBySkill,
    conversation_transcript || [],
  );

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
