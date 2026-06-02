/**
 * Shared skip-reason derivation for the Transcript tab and the Question
 * Analysis answer block, so both label a skipped question identically.
 *
 * WHY transcript-first: a question the candidate didn't answer shows as a Linda
 * message with no reply after it, and the saved `question_history.skip_source`
 * is frequently null after the finalization rebuild (most skips are synthetic
 * "[SKIPPED]" pairs inferred from the transcript, never a runtime entry that
 * carried a source). So we derive the reason from the RAW conversation_transcript
 * sequence — an "Are you there?" (silence_nudge) right after a question means the
 * candidate went silent — and only fall back to skip_source when it IS recorded
 * (authoritative for the candidate "Next Question" button and the 2-min timer).
 *
 * "answered" is decided by the CALLER from the transcript / answer text, never
 * from skip_source.
 */
export type SkipReason = { text: string; tone: 'amber' | 'gray' };

const _key = (s: string) => (s || '').trim().slice(0, 60);

function _fuzzyGet<T>(map: Map<string, T>, content: string): T | undefined {
  const k = _key(content);
  if (map.has(k)) return map.get(k);
  for (const [mk, v] of map) {
    if (k.startsWith(mk.slice(0, 40)) || mk.startsWith(k.slice(0, 40))) return v;
  }
  return undefined;
}

/**
 * Build a `(questionText, answered) => SkipReason | null` function from the raw
 * conversation transcript and question_history. Returns null when answered.
 */
export function buildSkipReasoner(
  rawTranscript: any[],
  questionHistory: any[],
): (questionText: string, answered: boolean) => SkipReason | null {
  // Questions immediately followed by an "Are you there?" nudge → silence-skipped.
  const silenceNudgedKeys = new Set<string>();
  let lastQKey = '';
  for (const m of rawTranscript || []) {
    if (m?.role !== 'assistant') continue;
    const c = (m.content || '').toLowerCase().trim();
    if (c.startsWith('are you there') || m.kind === 'silence_nudge') {
      if (lastQKey) silenceNudgedKeys.add(lastQKey);
    } else if (c && !c.startsWith('welcome back') && !c.startsWith('thank you') && !c.startsWith('thanks for')) {
      lastQKey = _key(m.content || '');
    }
  }

  const skipSrcMap = new Map<string, { rt: string; src: string }>();
  for (const qh of questionHistory || []) {
    if (!qh?.question) continue;
    skipSrcMap.set(_key(String(qh.question)), {
      rt: String(qh.response_type || '').toLowerCase(),
      src: String(qh.skip_source || '').toLowerCase(),
    });
  }

  const wasNudged = (content: string): boolean => {
    const k = _key(content);
    if (silenceNudgedKeys.has(k)) return true;
    for (const nk of silenceNudgedKeys) {
      if (k.startsWith(nk.slice(0, 40)) || nk.startsWith(k.slice(0, 40))) return true;
    }
    return false;
  };

  return (content: string, answered: boolean): SkipReason | null => {
    if (!content || answered) return null;
    const info = _fuzzyGet(skipSrcMap, content);
    const src = info?.src || '';
    const rt = info?.rt || '';
    if (src === 'candidate') {
      return { text: 'Skipped — candidate clicked “Next Question”', tone: 'amber' };
    }
    if (wasNudged(content) || src === 'silence_skip' || src === 'silence') {
      return { text: 'No response — auto-skipped after the “Are you there?” prompt', tone: 'gray' };
    }
    if (src === 'timer_expired' || rt === 'timeout') {
      return { text: 'No response — time ran out for this question', tone: 'gray' };
    }
    if (src === 'clarification_exceeded') {
      return { text: 'Moved on after repeated clarification requests', tone: 'gray' };
    }
    if (rt === 'idk') {
      return { text: 'Candidate said “I don’t know”', tone: 'gray' };
    }
    return { text: 'No response — moved on to the next question', tone: 'gray' };
  };
}

export type ClarificationTurn = { number: number; question: string; answer: string };

const _isClarificationMsg = (m: any): boolean => {
  if (m?.is_clarification === true) return true;
  const t = (m?.content || '').toLowerCase().trim();
  return (
    t.startsWith("let's stick to this question") ||
    t.startsWith('let me put it another way') ||
    t.startsWith('to put it differently') ||
    t.startsWith('let me rephrase')
  );
};

const _isNonQuestionAssistant = (m: any): boolean => {
  // Greeting / silence nudge / closing — these don't open a new question
  // group, so a clarification after one still belongs to the prior main Q.
  if (m?.kind === 'silence_nudge' || m?.is_closing === true || m?.kind === 'closing') return true;
  const t = (m?.content || '').toLowerCase().trim();
  return (
    t.startsWith('are you there') ||
    t.startsWith('welcome back') ||
    t.startsWith('thank you') ||
    t.startsWith('thanks for')
  );
};

/**
 * Build a `(questionText) => ClarificationTurn[]` lookup from the raw
 * conversation transcript, grouping each clarification ("Let's stick to this
 * question: …") under the most-recent real question that preceded it — the
 * SAME grouping the Transcript tab uses. The Question Analysis adapter calls
 * this to attach clarifications to their parent PerQuestionDetail so both
 * tabs surface them identically.
 */
export function buildClarificationsByQuestion(
  rawTranscript: any[],
): (questionText: string) => ClarificationTurn[] {
  const byKey = new Map<string, ClarificationTurn[]>();
  let lastQKey = '';
  let pending: ClarificationTurn | null = null;

  for (const m of rawTranscript || []) {
    if (m?.role === 'assistant') {
      if (_isClarificationMsg(m)) {
        if (!lastQKey) continue; // clarification before any question — skip
        const arr = byKey.get(lastQKey) || [];
        const turn: ClarificationTurn = {
          number: Number(m?.clarification_number) || arr.length + 1,
          question: String(m?.content || ''),
          answer: '',
        };
        arr.push(turn);
        byKey.set(lastQKey, arr);
        pending = turn;
      } else if (_isNonQuestionAssistant(m)) {
        pending = null; // don't move the group key onto a nudge/greeting/closing
      } else {
        // A real question (main or follow-up) opens / re-anchors the group.
        lastQKey = _key(m?.content || '');
        pending = null;
      }
    } else if (m?.role === 'user') {
      // Capture the candidate's first reply after a clarification as its answer.
      if (pending && !pending.answer) {
        pending.answer = String(m?.content || '');
        pending = null;
      }
    }
  }

  return (content: string): ClarificationTurn[] => {
    if (!content || byKey.size === 0) return [];
    const k = _key(content);
    if (byKey.has(k)) return byKey.get(k)!;
    for (const [mk, v] of byKey) {
      if (k.startsWith(mk.slice(0, 40)) || mk.startsWith(k.slice(0, 40))) return v;
    }
    return [];
  };
}
