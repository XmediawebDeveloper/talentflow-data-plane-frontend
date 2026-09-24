// Shared duplicate-skill matcher for the AI-interview skill lists.
//
// MIRRORS the backend helpers in `app/routers/ai_interview.py`
// (`_skill_token_sequence`, `_skill_initialism_match`, `_skill_duplicate_verdict`).
// Keep the two in sync — `tests/test_skill_duplicate_guard.py` pins the expected
// verdicts and a node harness runs this file against the same table.
//
// This lives in `lib/` rather than inside a component because BOTH skill-entry
// screens need it and they used to disagree: the Configure page had a semantic
// guard while the Clusters page (`/ai-interview-config/clusters`) compared exact
// strings only — so "Software development life cycle" was accepted there even
// though "SDLC and STLC Knowledge" was already in the list.

/** Framing / filler words that carry no skill identity. */
const SKILL_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'to', 'and', 'or', 'for', 'with', 'using',
  'your', 'their', 'this', 'that', 'these', 'those', 'is', 'are', 'be',
  'i', 'me', 'my', 'we', 'us', 'our', 'he', 'she', 'they', 'them',
  'have', 'has', 'having', 'am',
  // NOT 'it'/'its' — lowercasing makes that indistinguishable from the "IT"
  // abbreviation; "IT Support" must not collapse to bare "Support".
  'knowledge', 'knowledgeable', 'know', 'known', 'knowing',
  'understanding', 'understand', 'understands', 'understood',
  'familiarity', 'familiar', 'experience', 'experienced', 'ability',
  'skill', 'skills', 'skilled', 'proficiency', 'proficient',
  'expertise', 'expert', 'awareness', 'aware', 'exposure', 'exposed',
  'versed', 'adept', 'competent', 'competency', 'capable', 'conversant',
  'hands', 'on', 'handson', 'working', 'work', 'basic', 'strong', 'good',
  'solid', 'excellent', 'demonstrated', 'proven', 'practical', 'deep',
  'advanced', 'fundamental', 'fundamentals', 'concepts', 'concept', 'principles',
  'tools', 'tool', 'such', 'as', 'like', 'e.g', 'eg', 'clear', 'concise',
  'writing', 'write',
]);

/** Level / tier words that are IDENTITY-BEARING when they qualify the skill itself
 *  but framing when they qualify a framing noun. Mirrors backend
 *  `_SKILL_LEVEL_WORDS`. "Basic knowledge of SDLC" is just SDLC, but "Basic Life
 *  Support" is a DIFFERENT certification from "Advanced Life Support" — stripping
 *  these unconditionally merged BLS with ALS, "ISTQB Advanced" with "ISTQB" and
 *  "Basic Excel" with "Advanced Excel", each deleting a real qualification.
 *  Quality adjectives ('strong', 'good', 'solid', 'excellent', 'proven') are NOT
 *  here — "Good Communication" vs "Communication" is wording, not a level. */
const SKILL_LEVEL_WORDS = new Set([
  'basic', 'advanced', 'intermediate', 'fundamental', 'fundamentals', 'deep',
]);

/** Nouns that mark a phrase as JD FRAMING rather than a skill name. Mirrors backend
 *  `_SKILL_FRAMING_NOUNS`. */
const SKILL_FRAMING_NOUNS = new Set([
  'knowledge', 'understanding', 'familiarity', 'experience', 'ability',
  'proficiency', 'expertise', 'awareness', 'exposure', 'skill', 'skills',
]);

/** Curated acronym / variant expansions — mirrors backend `_SKILL_ALIASES`. */
const SKILL_ALIASES: Record<string, string> = {
  api: 'application programming interface', apis: 'application programming interface',
  ui: 'user interface', ux: 'user experience',
  sql: 'structured query language', db: 'database', dbs: 'database',
  qa: 'quality assurance', qc: 'quality control',
  ci: 'continuous integration', cd: 'continuous deployment',
  cicd: 'continuous integration continuous deployment',
  ms: 'microsoft', js: 'javascript', ts: 'typescript', k8s: 'kubernetes',
  oop: 'object oriented programming', ml: 'machine learning', ai: 'artificial intelligence',
  // TRUNCATION, not an acronym — no rule derives this from initials.
  postgres: 'postgresql',
  csharp: 'c sharp', 'c#': 'c sharp', 'c++': 'c plus plus', dotnet: 'dot net',
  // NOTE 'cpp' is deliberately NOT listed — it is recovered by RULE: the initialism
  // check also builds initials from the alias-EXPANDED words, so 'c++' → "c plus
  // plus" → 'cpp' matches the letters-only spelling on its own (and CICD ≡ CI/CD
  // likewise). Only 'cplusplus' stays: a spelled-out compound is not an initialism
  // of anything, so no rule can reach it.
  cplusplus: 'c plus plus',
  aws: 'amazon web services', gcp: 'google cloud platform',
};

/** Words that only DESCRIBE the skill beside them instead of naming a different
 *  product. Stored with raw AND stemmed forms because comparison runs on stems
 *  ("programming" → "programm"). Mirrors backend `_SKILL_GENERIC_QUALIFIERS`. */
const GENERIC_QUALIFIER_WORDS = [
  // "the doing of" words — these can only ever describe the noun beside them
  'usage', 'use', 'handling',
  'methodology', 'methodologies', 'method', 'methods', 'technique', 'techniques',
  'practice', 'practices', 'process', 'processes', 'procedure', 'procedures',
  'activity', 'activities', 'task', 'tasks', 'duty', 'duties',
  'essential', 'essentials', 'overview', 'general', 'core', 'misc', 'various',
  'language',
  // software-flavoured descriptors (still descriptors, not subjects)
  'programming', 'program', 'coding', 'code', 'scripting', 'script',
  'development', 'develop', 'dev', 'engineering', 'framework', 'library', 'stack',
  // CREDENTIAL markers — mirrors backend addition. "AWS Certification"/"AWS
  // Certified" names the same platform skill as "AWS" with proof attached;
  // narrower than the software-descriptor set above since it names the ACT
  // of being certified, never a body of knowledge in its own right.
  'certification', 'certifications', 'certified', 'certificate', 'certificates',
  'credential', 'credentials', 'credentialed',
  'license', 'licenses', 'licensed', 'licence', 'licences', 'licenced',
  'accreditation', 'accredited', 'qualification', 'qualifications', 'qualified',
];
// DELIBERATELY EXCLUDED, keep them out: 'standard(s)', 'policy', 'protocol',
// 'guideline', 'system(s)', 'technology', 'operation(s)', 'administration',
// 'workflow', 'theory', 'discipline'. Each NAMES a body of knowledge in some
// industry, so treating it as filler deletes a real skill — "Audit" vs "Auditing
// Standards" and "Retail" vs "Retail Operations" are different skills, and an
// earlier draft merged them. A word that is filler in one industry is the subject
// in another; structural rules generalise, vocabulary does not.

/** Closed compounds also written as two words, so the initialism rule can see the
 *  boundary. "RDBMS" expands as Relational DataBase Management System — the B is
 *  inside "Database", so without the split the initials read 'rdms'. */
const COMPOUND_SPLITS: Record<string, string> = {
  // cross-industry — "CPR" = Cardio-Pulmonary Resuscitation has the same shape as
  // "RDBMS" = Relational Data-Base Management System.
  lifecycle: 'life cycle', workflow: 'work flow', healthcare: 'health care',
  cardiopulmonary: 'cardio pulmonary', supplychain: 'supply chain',
  cashflow: 'cash flow', bookkeeping: 'book keeping', stakeholder: 'stake holder',
  timesheet: 'time sheet', caseload: 'case load', onboarding: 'on boarding',
  // software
  database: 'data base', databases: 'data base', codebase: 'code base',
  testcase: 'test case', testsuite: 'test suite', datastore: 'data store',
  sourcecontrol: 'source control', versioncontrol: 'version control',
};

/** Light stemmer — plurals and gerunds only. Mirrors backend `_skill_stem`. */
function skillStem(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
}

const GENERIC_QUALIFIERS = new Set<string>([
  ...GENERIC_QUALIFIER_WORDS,
  ...GENERIC_QUALIFIER_WORDS.map(skillStem),
]);

export function normalizeSkillName(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Decorative punctuation that never carries skill identity — a recruiter's
 *  fingers finishing a phrase the way they'd finish a sentence. Deliberately
 *  excludes the symbols real skill names use (# + / - & ( ) and a mid-word
 *  period), so "C#", "C++", "Node.js", ".NET", "TCP/IP", "R&D" and
 *  "Quality Assurance (QA)" are never rejected. Mirrors the intent of the
 *  backend's `_TRAILING_DECORATION_RE` in
 *  `semantic_skill_validator.normalize_skill`, but as an INPUT REJECTION
 *  here rather than a silent fold — this runs while the recruiter is still
 *  typing, so it can tell them immediately instead of quietly stripping it. */
const DECORATIVE_PUNCTUATION_RE = /[!?|,;:~^*"'`]/;

/** Returns the first disallowed character found in a candidate skill name, or
 *  null if it is clean. A period is fine mid-word ("Node.js", "ASP.NET") but
 *  not used as sentence punctuation: a trailing full stop, or one next to a
 *  space. */
export function findInvalidSkillPunctuation(name: string): string | null {
  const decorative = (name || '').match(DECORATIVE_PUNCTUATION_RE);
  if (decorative) return decorative[0];
  if (name.endsWith('.') || /\.\s|\s\./.test(name)) return '.';
  return null;
}

/** Punctuation/space-stripped form (keeps # and + so C# ≠ C++). */
function skillSquish(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9#+]/g, '');
}

/** Ordered canonical tokens. Mirrors backend `_skill_token_sequence`.
 *
 *  BRAND-JS FOLDING: "ReactJS" used to stem to 'reactj' while "React.js" expanded
 *  to {react, javascript} and "React" was {react} — three spellings, three
 *  identities. A trailing 'js' is dropped from a longer token, and a standalone
 *  'js' that FOLLOWS another token is dropped as a suffix; a leading/only 'js'
 *  still expands to javascript so the skill "JS" itself is unaffected.
 *
 *  ALL-CAPS tokens are opaque identifiers and are NOT stemmed — the plural-'s'
 *  rule turned "RDBMS" into 'rdbm', so the acronym could never match its own
 *  expansion. Mixed-case plurals like "APIs" still stem normally. */
export function skillTokenSequence(skill: string, expandAliases = true): string[] {
  if (!skill) return [];
  const caps = new Set(
    (skill.match(/\b[A-Z][A-Z0-9#+]+\b/g) || []).map(t => t.toLowerCase()),
  );
  const hasFramingNoun = ((skill || '').toLowerCase().match(/[a-z]+/g) || [])
    .some(w => SKILL_FRAMING_NOUNS.has(w));
  const norm = skill.toLowerCase().replace(/[._/\-]/g, ' ');
  const raw: string[] = norm.match(/[a-z0-9#+]+/g) || [];
  const pieces: string[] = [];
  raw.forEach((t, idx) => {
    let tok = t;
    if (tok === 'js') {
      if (idx > 0) return;
    } else if (tok.length > 3 && tok.endsWith('js')) {
      tok = tok.slice(0, -2);
    }
    pieces.push(...(COMPOUND_SPLITS[tok] || tok).split(' '));
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    for (const w of (expandAliases ? (SKILL_ALIASES[p] || p) : p).split(' ')) {
      const st = caps.has(w) ? w : skillStem(w);
      // Test the stopword list against BOTH the raw word and its stem. Stemming
      // runs first, so any -ing / -s entry was unreachable: 'writing' became
      // 'writ', which is not in the list, so "Test Case Writing" kept a 'writ'
      // token while "Write Test Cases" dropped 'write' as filler — and the two
      // phrasings of one skill never matched.
      // A level word survives unless the phrase also has a framing noun. The
      // stopword test happens TWICE (raw word and stem), so the exemption must be
      // threaded through BOTH — guarding only the raw form leaves the stem check
      // below to drop it anyway.
      const isLevelKeeper = SKILL_LEVEL_WORDS.has(w) && !hasFramingNoun;
      if (SKILL_STOPWORDS.has(w) && !isLevelKeeper) continue;
      // A SINGLE character is kept when alphanumeric — it is often the whole
      // identity of the skill. Dropping it merged genuinely different
      // qualifications in every industry: "Hepatitis B" ≡ "Hepatitis C", "Class B
      // Licence" ≡ "Class C Licence", "Vitamin D" ≡ "Vitamin K", "Type 1" ≡
      // "Type 2 Diabetes", "Grade A" ≡ "Grade B" welding — each deleted a real
      // skill. It also left "C" with no tokens at all, so the language could not
      // be compared with anything. Punctuation leftovers ('#', '+') are still
      // dropped, since they are not alphanumeric.
      const keep = st.length > 1 || /^[a-z0-9]$/.test(st);
      const isStop = SKILL_STOPWORDS.has(st) && !isLevelKeeper;
      if (keep && !isStop && !seen.has(st)) {
        seen.add(st);
        out.push(st);
      }
    }
  }
  return out;
}

/** Derivational suffixes, longest-first. Mirrors backend
 *  `_SKILL_DERIVATIONAL_SUFFIXES`. DELIBERATELY EXCLUDES the endings that collide
 *  across industries: 'er' (engineering → engineer → 'engine'), 'al', 'ent'
 *  ('patient' → 'pati'), 'ive', 'ory', 'ure', 'ous'. */
const DERIVATIONAL_SUFFIXES = [
  'ational', 'ization', 'isation', 'ation', 'ition', 'ution',
  'ement', 'ment', 'ness', 'ility', 'ity',
  'ance', 'ence', 'ancy', 'ency', 'ion',
  'ate', 'ise', 'ize', 'ify', 'ful', 'e',
];

/** Reduce a token to a root shared by its noun and verb forms — configuration /
 *  configure / configuring → 'configur'. Mirrors backend `_skill_deep_stem`.
 *  Never strips below 4 characters. */
function skillDeepStem(token: string): string {
  let root = token;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of DERIVATIONAL_SUFFIXES) {
      if (root.endsWith(suf) && root.length - suf.length >= 4) {
        root = root.slice(0, -suf.length);
        changed = true;
        break;
      }
    }
  }
  return root;
}

/** Deep-stemmed token set. Used ONLY for whole-set equality, never subset logic,
 *  so it can add detections but can never make a bundle look like one of its
 *  parts. Mirrors backend `_skill_root_tokens`. */
export function skillRootTokens(skill: string): Set<string> {
  return new Set(skillTokenSequence(skill).map(skillDeepStem));
}

export function skillContentTokens(skill: string): Set<string> {
  return new Set(skillTokenSequence(skill));
}

/** Acronym ↔ expansion detection. Mirrors backend `_skill_initialism_match`.
 *
 *  `exact` is true when the acronym is the WHOLE of its side ("SDLC" vs "Software
 *  Development Life Cycle") — same skill. It is false when the acronym is one
 *  token among several ("SDLC and STLC Knowledge"): that bundle CONTAINS the other
 *  skill plus more, so the addition is redundant rather than identical.
 *
 *  A bundled acronym must appear in CAPITALS in the original text, otherwise an
 *  ordinary word could act as an accidental acronym — "Test Case Design and
 *  Execution" contains 'test', which is exactly the initials of "Testing
 *  Environment Setup Tools". */
/** Drop a trailing "(ABBR)" that just restates the phrase's own acronym.
 *  Mirrors backend `_strip_self_acronym_parenthetical`.
 *
 *  "Software Testing Life Cycle (STLC)" is written this way constantly — left
 *  in, "(STLC)" becomes its own token and corrupts initials computation: 4
 *  content words + itself = 'stlcs', which no longer equals the very acronym
 *  ('stlc') the parenthetical was announcing — so "STLC" stopped matching the
 *  parenthetical form while it kept matching the bare phrase, which is
 *  backwards. Requires the parenthesised token to be short (2-8 letters) AND
 *  written in CAPS in the original text, so a genuine qualifier in parens is
 *  left alone. */
function stripSelfAcronymParenthetical(phrase: string): string {
  return (phrase || '').trim().replace(/\(\s*[A-Z][A-Z0-9]{1,7}\s*\)\s*$/, '').trim();
}

export function skillInitialismMatch(a: string, b: string): { hit: boolean; exact: boolean } {
  for (const [short, longRaw] of [[a, b], [b, a]] as [string, string][]) {
    const long = stripSelfAcronymParenthetical(longRaw);
    const lt = skillTokenSequence(long, false);
    // NOTE: no early `lt.length < 2` bail. "C++" is a SINGLE token yet still has an
    // initialism via its alias expansion ("c plus plus" → 'cpp'), so the candidate
    // set is built first and only an empty set skips this direction. The backend
    // (`_initialism_candidates`) is structured the same way; an early bail here
    // silently broke CPP ≡ C++ on the client only.
    // Candidate initialisms, because an acronym is built from EVERY word while
    // the token pipeline drops framing words: content-word initials give
    // 'sdlc' for "Knowledge of Software Development Life Cycle", and all-word
    // initials give 'bom' for "Bill of Materials", 'kyc' for "Know Your
    // Customer", 'bls' for "Basic Life Support" — stripping 'of'/'your'/'basic'
    // as filler destroyed a letter of the acronym. That assumption came from
    // software-style JD phrasing and fails in healthcare/finance/manufacturing.
    const candidates = new Set<string>();
    if (lt.length >= 2) candidates.add(lt.map(w => w[0]).join(''));
    const rawWords: string[] = (long || '').toLowerCase().replace(/[._/\-]/g, ' ')
      .match(/[a-z0-9#+]+/g) || [];
    const allWords = rawWords.flatMap(w => (COMPOUND_SPLITS[w] || w).split(' '));
    if (allWords.length >= 2) candidates.add(allWords.map(w => w[0]).join(''));
    // Initials of the alias-EXPANDED words, duplicates KEPT — kept in a SEPARATE
    // set because an expansion's initials often spell the acronym itself ("SQL" →
    // structured query language → 'sql'), making it an initialism of itself. Fed
    // into the bundled branch that made every phrase containing the token look like
    // a covering bundle ("SQL Server" flagged as covering "SQL"), so it is consulted
    // ONLY when the acronym is the whole side — which is what gives CPP ≡ C++ with
    // no table entry. De-duplicating would yield 'cp' and break it.
    const expandedWords = rawWords.flatMap(w => (SKILL_ALIASES[w] || w).split(' '));
    const expandedOnly = new Set<string>();
    if (expandedWords.length >= 2) {
      expandedOnly.add(expandedWords.map(w => w[0]).join(''));
    }
    if (candidates.size === 0 && expandedOnly.size === 0) continue;
    const st = skillTokenSequence(short, false);
    for (const tok of st) {
      if (tok.length < 3 || tok.length > 6 || !/^[a-z]+$/.test(tok)) continue;
      if (st.length === 1) {
        if (candidates.has(tok) || expandedOnly.has(tok)) {
          return { hit: true, exact: true };
        }
        continue;
      }
      if (!candidates.has(tok)) continue;
      if (new RegExp(`\\b${tok.toUpperCase()}\\b`).test(short || '')) {
        return { hit: true, exact: false };
      }
    }
  }
  return { hit: false, exact: false };
}

export type DupTier = 'high' | 'medium' | '';
export interface DupVerdict { dup: boolean; tier: DupTier; reason: string }

/** Classify two skill names as duplicates. Mirrors backend
 *  `_skill_duplicate_verdict`.
 *
 *  THE SUBSET RULE IS DELIBERATELY NARROW. It used to be "either token set is a
 *  subset of the other ⇒ same skill", which inverted reality for tech naming: it
 *  BLOCKED React vs React Native, SQL vs SQL Server, Azure vs Azure DevOps,
 *  Spring vs Spring Boot and Selenium vs Selenium WebDriver (all genuinely
 *  different skills — a longer name usually denotes a different PRODUCT), while
 *  ALLOWING React vs ReactJS (the same skill). Subset now counts only when every
 *  extra token is a generic qualifier, which keeps the cases the guard exists for:
 *  "Java" vs "Java Programming" and "API Testing" vs "Familiarity with API
 *  testing". */
/** Words that JOIN two skill names into one phrase, making it a LIST of skills
 *  ("SDLC and STLC", "Phlebotomy & Venepuncture") rather than a modified single
 *  name ("React Native", "Spring Boot"). Mirrors backend `_SKILL_BUNDLE_JOINERS`. */
const BUNDLE_JOINERS = ['and', '&', 'or', 'plus', 'along with', 'as well as'];

/** Split on conjunctions/commas that sit OUTSIDE any bracket, so an example list
 *  inside parentheses stays intact — "Basic Programming (Java, Python)" is one
 *  skill, not three. Mirrors backend `_split_skill_at_depth_zero`. */
function splitSkillAtDepthZero(name: string): string[] {
  if (!name || !name.trim()) return [];
  // Members are plain words plus '&' — none are regex metacharacters.
  const joiner = new RegExp('^\\s+(?:' + BUNDLE_JOINERS.join('|') + ')\\s+', 'i');
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  let i = 0;
  while (i < name.length) {
    const ch = name[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ',') {
        parts.push(buf);
        buf = '';
        i += 1;
        continue;
      }
      const m = joiner.exec(name.slice(i));
      if (m) {
        parts.push(buf);
        buf = '';
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  parts.push(buf);
  return parts.map(s => s.trim()).filter(Boolean);
}

/** Content-token sets of a bundle's members, or [] when the phrase is not a bundle.
 *  Mirrors backend `_skill_bundle_parts`.
 *
 *  NEVER used to split a skill automatically: nothing in the string separates a
 *  list from a compound noun phrase, and "Research and Development", "Health and
 *  Safety", "Mergers and Acquisitions" and "Payroll and Benefits Administration"
 *  are single competencies whose halves are nonsense on their own. The members are
 *  only compared against skills the recruiter already entered separately. */
export function skillBundleParts(name: string): Set<string>[] {
  return skillBundleMembers(name).map(m => m.tokens);
}

/** Trim leading/trailing framing words while keeping the ORIGINAL wording — the
 *  result is shown to the recruiter, so "Profit and Loss Analysis" must not come
 *  back stemmed. Mirrors backend `_strip_skill_framing`. */
export function stripSkillFraming(raw: string): string {
  const words = (raw || '').split(/\s+/).filter(Boolean);
  while (words.length && skillContentTokens(words[0]).size === 0) words.shift();
  while (words.length && skillContentTokens(words[words.length - 1]).size === 0) words.pop();
  return words.join(' ') || (raw || '').trim();
}

/** `{ name, tokens }` per bundle member, or []. Mirrors backend
 *  `_skill_bundle_members`. */
export function skillBundleMembers(name: string): { name: string; tokens: Set<string> }[] {
  const raw = splitSkillAtDepthZero(name);
  if (raw.length < 2) return [];
  const members: { name: string; tokens: Set<string> }[] = [];
  for (const r of raw) {
    const toks = skillContentTokens(r);
    if (toks.size === 0) return [];
    const dup = members.some(
      m => m.tokens.size === toks.size && [...m.tokens].every(t => toks.has(t)),
    );
    if (!dup) members.push({ name: stripSkillFraming(r), tokens: toks });
  }
  return members.length >= 2 ? members : [];
}

/** True when `part` is exactly one member of the list `bundle` enumerates.
 *  Mirrors backend `_skill_is_bundle_part`.
 *
 *  The subset rule deliberately cannot see this: a longer name normally means a
 *  DIFFERENT product ("React" vs "React Native"). A conjunction says the opposite —
 *  the phrase enumerates members instead of qualifying a head noun.
 *
 *  Also catches the ACRONYM form of a member even when the bundle spells that
 *  member out in full — "SDLC" against "software development life cycle and
 *  software testing life cycle" — via `skillInitialismMatch` per member, rather
 *  than only literal word-set equality. Table-free, same as the backend. */
export function skillIsBundlePart(part: string, bundle: string): boolean {
  const pt = skillContentTokens(part);
  if (pt.size === 0) return false;
  const members = skillBundleMembers(bundle);
  if (members.some(m => m.tokens.size === pt.size && [...m.tokens].every(t => pt.has(t)))) {
    return true;
  }
  if (members.some(m => skillInitialismMatch(part, m.name).hit)) {
    return true;
  }
  // SHARED TRAILING HEAD — "Knowledge of ICU and CCU protocols" splits into {icu}
  // and {ccu, protocol}, because "protocols" is written once but belongs to both
  // members ("SDLC and STLC processes", "manual and automated testing"). So the
  // LAST member also matches on its head alone, provided the dropped words are a
  // trailing run of that member's own text.
  //
  // WARNING-ONLY: cluster generation keeps the strict member list, so a bundle with
  // a shared head is never DELETED in favour of its heads. Mirrors the backend.
  if (members.length > 0) {
    const last = members[members.length - 1];
    const strictlySmaller = pt.size < last.tokens.size && [...pt].every(t => last.tokens.has(t));
    if (strictlySmaller) {
      const words = last.name.split(/\s+/).filter(Boolean);
      for (let cut = 1; cut < words.length; cut++) {
        const head = skillContentTokens(words.slice(0, cut).join(' '));
        if (head.size === pt.size && [...head].every(t => pt.has(t))) return true;
      }
    }
  }
  return false;
}

export function skillDuplicateVerdict(a: string, b: string): DupVerdict {
  const no: DupVerdict = { dup: false, tier: '', reason: '' };
  if (!a || !b) return no;
  if (normalizeSkillName(a) === normalizeSkillName(b)) {
    return { dup: true, tier: 'high', reason: 'identical' };
  }
  const sa = skillSquish(a);
  if (sa.length > 1 && sa === skillSquish(b)) {
    return { dup: true, tier: 'high', reason: 'same words, different punctuation' };
  }
  const ini = skillInitialismMatch(a, b);
  if (ini.hit) {
    return ini.exact
      ? { dup: true, tier: 'high', reason: 'acronym of the same term' }
      : { dup: true, tier: 'medium', reason: "already covered by the other skill's acronym" };
  }
  const ta = skillContentTokens(a);
  const tb = skillContentTokens(b);
  if (ta.size === 0 || tb.size === 0) return no;
  if (ta.size === tb.size && [...ta].every(t => tb.has(t))) {
    return { dup: true, tier: 'high', reason: 'same meaning, different wording' };
  }
  // Same words in a different grammatical form and/or order — "Configure Servers"
  // vs "Server Configuration", "Validate Data" vs "Data Validation", "Administer
  // Medication" vs "Medication Administration". Must run BEFORE the containment
  // check below, which returns early when the raw token sets don't nest (they
  // don't here: 'configure' is not in {server, configuration}). Whole-SET equality
  // only, so it can never make a bundle look like one of its parts.
  const ra = skillRootTokens(a);
  const rb = skillRootTokens(b);
  if (ra.size > 0 && ra.size === rb.size && [...ra].every(t => rb.has(t))) {
    return { dup: true, tier: 'high', reason: 'same words in a different form or order' };
  }
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if ([...small].every(t => large.has(t))) {
    const extra = [...large].filter(t => !small.has(t));
    if (extra.length > 0 && extra.every(t => GENERIC_QUALIFIERS.has(t))) {
      return { dup: true, tier: 'medium', reason: 'one is a reworded form of the other' };
    }
  }
  // BUNDLE MEMBERSHIP — one side enumerates a list that already contains the other
  // ("SDLC" vs "Knowledge of SDLC and STLC"). HIGH, not medium (mirrors backend,
  // changed 2026-09-03 per explicit product decision): a new skill whose sentence
  // names a skill already on the list is rejected outright, not warned-with-
  // override. Cluster generation still drops the BUNDLE (not the member) once
  // every member is present, for the same reason this is high here.
  if (skillIsBundlePart(a, b) || skillIsBundlePart(b, a)) {
    return { dup: true, tier: 'high', reason: 'already listed inside the other skill' };
  }
  return no;
}

/** Boolean form for call sites that only need yes/no. */
export function skillsSemanticallyEqual(a: string, b: string): boolean {
  return skillDuplicateVerdict(a, b).dup;
}

/** The CLOSEST existing duplicate, not merely the first.
 *
 *  `find()` returned whichever entry came first, so adding "React" with both
 *  "React Native" and "ReactJS" present blamed React Native. Ranks high tier over
 *  medium, then by shared-token count. */
export function closestDuplicate<T>(
  candidates: T[],
  nameOf: (c: T) => string,
  incoming: string,
): { item: T; tier: DupTier; reason: string } | null {
  const incomingTokens = skillContentTokens(incoming);
  let best: { item: T; tier: DupTier; reason: string; rank: number } | null = null;
  for (const c of candidates) {
    const v = skillDuplicateVerdict(nameOf(c), incoming);
    if (!v.dup) continue;
    const shared = [...skillContentTokens(nameOf(c))].filter(t => incomingTokens.has(t)).length;
    const rank = (v.tier === 'high' ? 1000 : 0) + shared;
    if (!best || rank > best.rank) {
      best = { item: c, tier: v.tier, reason: v.reason, rank };
    }
  }
  return best ? { item: best.item, tier: best.tier, reason: best.reason } : null;
}
