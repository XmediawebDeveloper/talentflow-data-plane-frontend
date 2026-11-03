/**
 * Bina speech sync — ONE clock for her voice, lips and caption.
 *
 * The voice is the truth: what matters is which sample the candidate is
 * HEARING right now. Two pieces turn that into "which word is being said":
 *
 *  1. PlaybackClock / FallbackClock — the audible position (ms into the
 *     utterance). On the worklet path the playback worklet reports how many
 *     samples it has really played (underrun silence excluded) against the
 *     audio-thread frame counter; AudioContext.getOutputTimestamp() then gives
 *     the frame the speakers are on. On the Web Audio fallback the scheduled
 *     buffer start times give the same answer. Both stop when the context is
 *     suspended (frozen turn) and when the network starves playback.
 *
 *  2. SpeechSync — maps that position to words. The TTS gives no timings, but
 *     its audio does: Bina pauses at sentence ends and commas. Pauses found in
 *     the PCM (it arrives faster than real time, so ahead of playback) are
 *     matched to the punctuation in the text and become exact anchors. Words
 *     are spread by spoken weight only BETWEEN anchors, on voiced time, so a
 *     word can never land inside a silence. Before the first anchor and after
 *     the last, a self-calibrating rate fills in.
 *
 * Words are whitespace tokens that contain a letter or digit, with em/en
 * dashes as separators. The caption and the lips index words the same way, so
 * a caption string that differs only in punctuation/markdown still lines up.
 */

const FRAME_MS = 10;
/** A silence at least this long between voiced frames is a pause candidate. */
const MIN_PAUSE_MS = 140;
/** Pauses this long are almost always punctuation. */
const LONG_PAUSE_MS = 280;
// Alignment costs (see SpeechSync.align). A segment whose weight is 35% off
// its voiced time costs ~0.5; leaving a long pause unexplained costs more than
// that, a short one less; skipping a sentence end is expensive, a comma cheap.
const REL_ERR_WEIGHT = 4;
const SKIP_LONG_PAUSE = 1.2;
const SKIP_SHORT_PAUSE = 0.35;
const SKIP_SENTENCE = 0.8;
const SKIP_COMMA = 0.08;
const SENTENCE_BONUS = 0.1;
/** Spoken weight per VOICED ms. Prior only — learned from each finished
 *  utterance. Staging 2026-11-02 (AI_TTS_SPEED 0.85): intro 890 chars / 52.6 s
 *  incl. pauses ≈ 17 weight/s → ~18 per voiced second. */
const DEFAULT_RATE = 0.018;
/** How much anchored speech (ms) it takes for this utterance's own rate to dominate the prior. */
const RATE_PRIOR_MS = 1500;
/** Frames quieter than this fraction of the speech level count as silence. */
const SILENCE_FRACTION = 0.12;

// Learned across utterances (module scope = one interview page).
let priorRate: number | null = null;

interface Token {
  charStart: number;
  charEnd: number;
  text: string;
  weight: number;
  /** Pause strength after this token: 2 sentence end, 1 comma/colon/dash, 0 none. */
  brk: 0 | 1 | 2;
}

export interface SpeechWord {
  start: number;
  end: number;
}

interface Pause {
  start: number;
  end: number;
}

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

function wordWeight(text: string): number {
  const core = text.replace(/[^\p{L}\p{N}\p{M}]/gu, "");
  const digits = (core.match(/\p{N}/gu) || []).length;
  const letters = core.length - digits;
  // Acronyms are spelled out letter by letter ("LPA" → L-P-A).
  let w = letters > 0 && /^[A-Z]{2,6}s?$/.test(core) ? letters * 2.5 : letters;
  // Digits are read as words ("2026" → twenty twenty-six).
  w += digits * 4.5;
  return Math.max(1, w) + 1;
}

export function tokenizeSpeech(text: string): Token[] {
  const out: Token[] = [];
  const re = /[^\s–—]+/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(text))) {
    const t = m[0];
    const prev = out[out.length - 1];
    // A dash between words is spoken as a comma (normalize_tts_text).
    if (prev && /[–—]/.test(text.slice(lastEnd, m.index)) && prev.brk < 1) prev.brk = 1;
    lastEnd = m.index + t.length;
    if (!HAS_WORD_CHAR.test(t)) {
      // Punctuation-only token ("**", "-", "?"): it only adds a pause to the word before.
      if (prev) {
        if (/[.?!…]/.test(t)) prev.brk = 2;
        else if (/[,;:]/.test(t) && prev.brk < 1) prev.brk = 1;
        prev.charEnd = lastEnd;
      }
      continue;
    }
    const tail = t.replace(/["'’”)\]*_`]+$/u, "");
    const last = tail.slice(-1);
    const brk: 0 | 1 | 2 = /[.?!…]/.test(last) ? 2 : /[,;:]/.test(last) ? 1 : 0;
    out.push({ charStart: m.index, charEnd: lastEnd, text: t, weight: wordWeight(t), brk });
  }
  return out;
}

/** Wall time reached after `v` ms of VOICED time from `s`, skipping `gaps`. */
function voicedToWall(s: number, v: number, gaps: Pause[], afterGap: boolean): number {
  let t = s;
  let remaining = v;
  for (const g of gaps) {
    if (g.end <= t) continue;
    const room = g.start - t;
    if (afterGap ? remaining < room : remaining <= room) return t + remaining;
    remaining -= Math.max(0, room);
    t = g.end;
  }
  return t + remaining;
}

function voicedBetween(a: number, b: number, gaps: Pause[]): number {
  let v = b - a;
  for (const g of gaps) {
    const lo = Math.max(a, g.start);
    const hi = Math.min(b, g.end);
    if (hi > lo) v -= hi - lo;
  }
  return Math.max(0, v);
}

/** Incremental RMS envelope + onset / pause / end detection on Int16 PCM. */
class PauseDetector {
  readonly env: number[] = [];
  readonly pauses: Pause[] = [];
  onsetMs: number | null = null;
  private lastVoicedFrame = -1;
  private silentSince: number | null = null;
  private level = 0;
  private acc = 0;
  private accN = 0;
  private readonly frameSamples: number;

  constructor(sampleRate: number) {
    this.frameSamples = Math.round((sampleRate * FRAME_MS) / 1000);
  }

  get threshold(): number {
    return this.level > 0 ? Math.min(0.03, Math.max(0.004, this.level * SILENCE_FRACTION)) : 0.01;
  }

  get speechLevel(): number {
    return this.level || 0.1;
  }

  get endMs(): number | null {
    return this.lastVoicedFrame >= 0 ? (this.lastVoicedFrame + 1) * FRAME_MS : null;
  }

  /** Returns true when onset or the pause list changed. */
  push(samples: Int16Array): boolean {
    let changed = false;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] / 32768;
      this.acc += s * s;
      if (++this.accN === this.frameSamples) {
        changed = this.closeFrame(Math.sqrt(this.acc / this.accN)) || changed;
        this.acc = 0;
        this.accN = 0;
      }
    }
    return changed;
  }

  private closeFrame(rms: number): boolean {
    const frame = this.env.length;
    this.env.push(rms);
    if (rms > 0.02) this.level = this.level ? this.level * 0.95 + rms * 0.05 : rms;
    if (rms < this.threshold) {
      if (this.silentSince === null) this.silentSince = frame;
      return false;
    }
    let changed = false;
    if (this.onsetMs === null) {
      this.onsetMs = frame * FRAME_MS;
      changed = true;
    } else if (this.silentSince !== null && (frame - this.silentSince) * FRAME_MS >= MIN_PAUSE_MS) {
      this.pauses.push({ start: this.silentSince * FRAME_MS, end: frame * FRAME_MS });
      changed = true;
    }
    this.silentSince = null;
    this.lastVoicedFrame = frame;
    return changed;
  }
}

export interface SpeechSyncStats {
  words: number;
  pauses: number;
  anchors: number;
  unmatchedPauses: number;
  onsetMs: number | null;
  endMs: number | null;
  receivedMs: number;
  rate: number;
  final: boolean;
}

export class SpeechSync {
  private text = "";
  private version = 0;
  private tokens: Token[] = [];
  private cumW: number[] = [0];
  private det: PauseDetector;
  private final = false;
  private receivedMs = 0;
  private dirty = true;
  private words: SpeechWord[] = [];
  private anchorCount = 0;
  private unmatchedCount = 0;
  private rateUsed = DEFAULT_RATE;
  private learned = false;
  private captionCache: { text: string; tokens: Token[] } = { text: "", tokens: [] };

  private readonly sampleRate: number;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.det = new PauseDetector(sampleRate);
  }

  /** A new utterance's audio starts. Text is kept (it arrives before the audio). */
  begin(): void {
    this.det = new PauseDetector(this.sampleRate);
    this.final = false;
    this.receivedMs = 0;
    this.learned = false;
    this.dirty = true;
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.tokens = tokenizeSpeech(text);
    this.version++;
    this.cumW = [0];
    for (const t of this.tokens) this.cumW.push(this.cumW[this.cumW.length - 1] + t.weight);
    this.dirty = true;
  }

  /** Int16 PCM at the constructor's sample rate, in arrival order. */
  push(pcm: ArrayBuffer): void {
    if (pcm.byteLength < 2) return;
    const samples = new Int16Array(pcm, 0, pcm.byteLength >> 1);
    this.receivedMs += (samples.length / this.sampleRate) * 1000;
    if (this.det.push(samples)) this.dirty = true;
    // The open tail segment is placed by rate, which does not depend on
    // receivedMs — but its words must be rebuilt as anchors land, which the
    // flag above covers.
  }

  /** All of this utterance's audio has arrived. */
  finish(): void {
    if (this.final) return;
    this.final = true;
    this.dirty = true;
    this.build();
    this.learnRate();
  }

  /** Bumped whenever the text (and so the word list) changes. */
  get textVersion(): number {
    return this.version;
  }

  tokenText(index: number): string | undefined {
    return this.tokens[index]?.text;
  }

  stats(): SpeechSyncStats {
    this.build();
    return {
      words: this.tokens.length,
      pauses: this.det.pauses.length,
      anchors: this.anchorCount,
      unmatchedPauses: this.unmatchedCount,
      onsetMs: this.det.onsetMs,
      endMs: this.final ? this.det.endMs : null,
      receivedMs: Math.round(this.receivedMs),
      rate: Number(this.rateUsed.toFixed(4)),
      final: this.final,
    };
  }

  /** 0..1 loudness of the voice at `posMs`, relative to Bina's speech level (0 in silence). */
  voiceGainAt(posMs: number): number {
    const i = Math.floor(posMs / FRAME_MS);
    if (i < 0 || i >= this.det.env.length) return 0;
    const thr = this.det.threshold;
    const rms = this.det.env[i];
    if (rms < thr) return 0;
    return Math.min(1, (rms - thr) / Math.max(1e-4, this.det.speechLevel - thr));
  }

  /** Index of the word being spoken at `posMs` and how far into it (0..1), or null in a silence. */
  wordAt(posMs: number): { index: number; frac: number } | null {
    this.build();
    const w = this.words;
    let lo = 0;
    let hi = w.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (w[mid].start <= posMs) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found < 0 || posMs >= w[found].end) return null;
    const span = w[found].end - w[found].start;
    return { index: found, frac: span > 0 ? (posMs - w[found].start) / span : 0 };
  }

  /**
   * Characters of `captionText` to show at audible position `posMs`: every
   * word whose start is within `leadMs` ahead. Words are matched by index, so
   * the caption may differ from the lip text in punctuation/markdown.
   */
  revealChars(captionText: string, posMs: number, leadMs: number): number {
    this.build();
    if (this.captionCache.text !== captionText) {
      this.captionCache = { text: captionText, tokens: tokenizeSpeech(captionText) };
    }
    const cap = this.captionCache.tokens;
    const w = this.words;
    if (!cap.length || !w.length) return 0;
    const t = posMs + leadMs;
    let lo = 0;
    let hi = w.length - 1;
    let count = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (w[mid].start <= t) { count = mid + 1; lo = mid + 1; } else hi = mid - 1;
    }
    if (count === 0) return 0;
    if (count === w.length && this.final && t >= w[w.length - 1].end) return captionText.length;
    const idx = cap.length === w.length
      ? count - 1
      : Math.min(cap.length - 1, Math.floor((count * cap.length) / w.length) - 1);
    return idx < 0 ? 0 : cap[idx].charEnd;
  }

  private build(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.words = [];
    this.anchorCount = 0;
    this.unmatchedCount = 0;
    const tokens = this.tokens;
    const n = tokens.length;
    const onset = this.det.onsetMs;
    if (!n || onset === null) return;
    const cumW = this.cumW;
    const prior = priorRate ?? DEFAULT_RATE;

    // ── Match pauses to punctuation (whole-utterance alignment) ────────
    // Once all audio is in, the overall rate is exact (all weight ÷ all voiced
    // time). While it streams: align with the prior, re-estimate the rate from
    // what got anchored, align again.
    const pauses = this.det.pauses;
    const endMs = this.final ? this.det.endMs : null;
    let rate: number;
    let match: number[];
    if (endMs !== null) {
      const voicedAll = voicedBetween(onset, endMs, pauses);
      rate = voicedAll > 300 ? cumW[n] / voicedAll : prior;
      match = this.align(rate, onset, endMs);
    } else {
      match = this.align(prior, onset, null);
      let aw = 0;
      let am = 0;
      let prevTok = 0;
      let prevMs = onset;
      const skipped: Pause[] = [];
      pauses.forEach((p, k) => {
        if (match[k] < 0) { skipped.push(p); return; }
        aw += cumW[match[k] + 1] - cumW[prevTok];
        am += voicedBetween(prevMs, p.start, skipped);
        prevTok = match[k] + 1;
        prevMs = p.end;
      });
      rate = (aw + prior * RATE_PRIOR_MS) / (am + RATE_PRIOR_MS);
      if (am > 0) match = this.align(rate, onset, null);
    }
    const segStarts: { tok: number; ms: number }[] = [{ tok: 0, ms: onset }];
    const segEnds: number[] = [];
    const unmatched: Pause[] = [];
    pauses.forEach((p, k) => {
      if (match[k] < 0) { unmatched.push(p); return; }
      segEnds.push(p.start);
      segStarts.push({ tok: match[k] + 1, ms: p.end });
    });
    this.anchorCount = segStarts.length - 1;
    this.unmatchedCount = unmatched.length;
    this.rateUsed = rate;

    // ── Place words: closed segments by weight on voiced time; the open
    // tail (audio still arriving) by rate ──────────────────────────────
    for (let k = 0; k < segStarts.length; k++) {
      const s = segStarts[k];
      const tokEnd = k + 1 < segStarts.length ? segStarts[k + 1].tok : n;
      const segEnd = k < segEnds.length ? segEnds[k] : endMs;
      const gaps = unmatched.filter((g) => g.start >= s.ms && (segEnd === null || g.end <= segEnd));
      const W = cumW[tokEnd] - cumW[s.tok];
      const msPerW = segEnd !== null && W > 0
        ? voicedBetween(s.ms, Math.max(s.ms, segEnd), gaps) / W
        : 1 / rate;
      for (let i = s.tok; i < tokEnd; i++) {
        const v0 = (cumW[i] - cumW[s.tok]) * msPerW;
        const v1 = (cumW[i + 1] - cumW[s.tok]) * msPerW;
        this.words.push({
          start: voicedToWall(s.ms, v0, gaps, true),
          end: voicedToWall(s.ms, v1, gaps, false),
        });
      }
    }
  }

  /**
   * Best monotonic assignment of pauses → punctuation boundaries (token index
   * the pause follows), -1 = pause not at punctuation. Minimises: squared
   * relative error of each segment's weight vs its voiced time at `rate`,
   * plus penalties for unexplained pauses and for punctuation with no pause
   * (a skipped sentence end is expensive, a skipped comma cheap — TTS often
   * runs through commas). Judging all pauses together is what keeps two close
   * commas ("authentication, versioning, and") from pulling every later
   * anchor one boundary early.
   */
  private align(rate: number, onset: number, endMs: number | null): number[] {
    const P = this.det.pauses;
    const K = P.length;
    const tokens = this.tokens;
    const n = tokens.length;
    const cumW = this.cumW;
    const B: number[] = [];
    for (let b = 0; b < n - 1; b++) if (tokens[b].brk) B.push(b);
    const M = B.length;
    const pd = [0];
    for (const p of P) pd.push(pd[pd.length - 1] + (p.end - p.start));
    const skipPause = (k: number) => (P[k].end - P[k].start >= LONG_PAUSE_MS ? SKIP_LONG_PAUSE : SKIP_SHORT_PAUSE);
    const skipBound = (j: number) => (tokens[B[j]].brk === 2 ? SKIP_SENTENCE : SKIP_COMMA);
    const segCost = (W: number, voiced: number) => {
      const exp = voiced * rate;
      const rel = (W - exp) / Math.max(exp, 8);
      return REL_ERR_WEIGHT * rel * rel;
    };
    // Node (i, j): pause i matched to boundary j; (-1, -1) = utterance start.
    const key = (i: number, j: number) => (i + 1) * (M + 1) + (j + 1);
    const cost = new Float64Array((K + 1) * (M + 1)).fill(Infinity);
    const from = new Int32Array((K + 1) * (M + 1)).fill(-1);
    cost[key(-1, -1)] = 0;
    // Skipping more than this many pauses / boundaries in a row is not a real reading.
    const MAX_SKIP_P = 5;
    const MAX_SKIP_B = 12;
    let bestEnd = Infinity;
    let bestNode = key(-1, -1);
    for (let i = -1; i < K; i++) {
      for (let j = -1; j < M; j++) {
        const c0 = cost[key(i, j)];
        if (c0 === Infinity) continue;
        const prevMs = i < 0 ? onset : P[i].end;
        const prevTok = j < 0 ? 0 : B[j] + 1;
        // Extend: match a later pause k to a later boundary jj.
        let skipP = 0;
        for (let k = i + 1; k < K && k - i - 1 <= MAX_SKIP_P; k++) {
          const voiced = P[k].start - prevMs - (pd[k] - pd[i + 1]);
          let skipB = 0;
          for (let jj = j + 1; jj < M && jj - j - 1 <= MAX_SKIP_B; jj++) {
            const W = cumW[B[jj] + 1] - cumW[prevTok];
            if (voiced > 0) {
              const c = c0 + skipP + skipB + segCost(W, voiced)
                - (tokens[B[jj]].brk === 2 && P[k].end - P[k].start >= LONG_PAUSE_MS ? SENTENCE_BONUS : 0);
              const kk = key(k, jj);
              if (c < cost[kk]) { cost[kk] = c; from[kk] = key(i, j); }
            }
            skipB += skipBound(jj);
          }
          skipP += skipPause(k);
        }
        // Close: no further matches from here.
        let tail = 0;
        for (let k = i + 1; k < K; k++) tail += skipPause(k);
        if (endMs !== null) {
          const voiced = endMs - prevMs - (pd[K] - pd[i + 1]);
          for (let jj = j + 1; jj < M; jj++) tail += skipBound(jj);
          tail += voiced > 0 ? segCost(cumW[n] - cumW[prevTok], voiced) : REL_ERR_WEIGHT;
        } else {
          // Still streaming: only punctuation that should already have been
          // spoken (well inside the audio so far) counts as skipped.
          const lastVoiced = this.det.endMs ?? prevMs;
          const said = Math.max(0, lastVoiced - prevMs - (pd[K] - pd[i + 1])) * rate * 0.75;
          for (let jj = j + 1; jj < M && cumW[B[jj] + 1] - cumW[prevTok] < said; jj++) tail += skipBound(jj);
        }
        if (c0 + tail < bestEnd) { bestEnd = c0 + tail; bestNode = key(i, j); }
      }
    }
    const match = new Array<number>(K).fill(-1);
    for (let node = bestNode; node > 0 && node !== key(-1, -1); node = from[node]) {
      const i = Math.floor(node / (M + 1)) - 1;
      const j = (node % (M + 1)) - 1;
      if (i >= 0 && j >= 0) match[i] = B[j];
      if (from[node] < 0) break;
    }
    return match;
  }

  private learnRate(): void {
    if (this.learned) return;
    this.learned = true;
    const onset = this.det.onsetMs;
    const end = this.det.endMs;
    const W = this.cumW[this.cumW.length - 1];
    if (onset === null || end === null || this.tokens.length < 4) return;
    const voiced = voicedBetween(onset, end, this.det.pauses);
    if (voiced < 1500) return;
    const sample = W / voiced;
    if (sample < 0.008 || sample > 0.03) return;
    priorRate = priorRate === null ? sample : priorRate * 0.7 + sample * 0.3;
  }
}

/**
 * Context time (s) of the sample the speakers are playing right now.
 * getOutputTimestamp() already accounts for output latency; the
 * outputLatency/baseLatency subtraction is the fallback where it is missing.
 * Never advances while the context is suspended.
 */
export function audibleContextTime(ctx: AudioContext): number {
  const running = ctx.state === "running";
  try {
    const ts = ctx.getOutputTimestamp?.();
    if (ts && typeof ts.contextTime === "number" && ts.contextTime > 0 && typeof ts.performanceTime === "number") {
      let t = ts.contextTime;
      if (running && ts.performanceTime > 0) {
        t += Math.min(0.1, Math.max(0, (performance.now() - ts.performanceTime) / 1000));
      }
      return t;
    }
  } catch { /* fall through */ }
  const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
  return Math.max(0, ctx.currentTime - (Number.isFinite(lat) ? lat : 0));
}

interface ClockSample {
  frame: number;
  played: number;
  queued: number;
}

/**
 * Audible position on the TalkingHead worklet path. The worklet posts
 * {type:"clock"} with its played-sample count against the audio-thread frame;
 * `mark()` (posted on the same port, in order with the audio) pins where this
 * utterance's first sample sits in that count.
 */
export class PlaybackClock {
  private id = 0;
  private markPos: number | null = null;
  private hist: ClockSample[] = [];
  /** null = not yet known for this worklet node. */
  supported: boolean | null = null;
  private markedAt = 0;

  reset(): void {
    this.id++;
    this.markPos = null;
    this.hist = [];
  }

  mark(port: MessagePort): void {
    this.reset();
    this.markedAt = performance.now();
    try { port.postMessage({ type: "clock-mark", id: this.id }); } catch { /* port gone */ }
  }

  onMessage(d: { type?: string; id?: number; mark?: number; played?: number; frame?: number; queued?: number }): void {
    if (d?.type !== "clock") return;
    this.supported = true;
    if (d.id !== this.id || typeof d.played !== "number" || typeof d.frame !== "number") return;
    if (typeof d.mark === "number") this.markPos = d.mark;
    this.hist.push({ frame: d.frame, played: d.played, queued: d.queued ?? 0 });
    if (this.hist.length > 160) this.hist.splice(0, this.hist.length - 128);
  }

  get marked(): boolean {
    return this.id > 0 && this.markedAt > 0;
  }

  /** ms since mark() without any reply — an old cached worklet never replies. */
  msSinceMark(): number {
    return this.markedAt ? performance.now() - this.markedAt : 0;
  }

  /** Utterance position (ms) at audible context time `t`, or null if unknown yet. */
  positionMs(t: number, sampleRate: number): number | null {
    if (this.markPos === null || !this.hist.length) return this.markPos === null ? null : 0;
    const frameT = t * sampleRate;
    const h = this.hist;
    let played: number;
    if (frameT < h[0].frame) {
      played = h[0].played - (h[0].frame - frameT);
    } else {
      let i = h.length - 1;
      while (i > 0 && h[i].frame > frameT) i--;
      const e = h[i];
      const next = h[i + 1];
      const dt = frameT - e.frame;
      played = next
        ? e.played + Math.min(dt, next.played - e.played)
        : e.played + Math.min(dt, e.queued, sampleRate * 0.1);
    }
    return Math.max(0, ((played - this.markPos) / sampleRate) * 1000);
  }
}

/** Audible position on the Web Audio fallback path (scheduled buffers). */
export class FallbackClock {
  private segs: { start: number; dur: number; off: number }[] = [];
  private total = 0;

  reset(): void {
    this.segs = [];
    this.total = 0;
  }

  add(startAt: number, durSec: number): void {
    this.segs.push({ start: startAt, dur: durSec, off: this.total });
    this.total += durSec * 1000;
    if (this.segs.length > 400) this.segs.splice(0, 100);
  }

  get active(): boolean {
    return this.segs.length > 0;
  }

  positionMs(t: number): number {
    const s = this.segs;
    if (!s.length || t < s[0].start) return 0;
    let i = s.length - 1;
    while (i > 0 && s[i].start > t) i--;
    const seg = s[i];
    return seg.off + Math.min(seg.dur, t - seg.start) * 1000;
  }
}
