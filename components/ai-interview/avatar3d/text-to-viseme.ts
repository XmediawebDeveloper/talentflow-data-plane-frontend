import type { VisemeWeights } from "./avatar3d-types";
import { DEFAULT_VISEME_WEIGHTS } from "./avatar3d-types";

/**
 * Text-to-Viseme lip sync engine.
 *
 * Converts English text → phoneme/viseme sequence, then distributes
 * visemes proportionally across the audio duration so mouth shapes
 * actually match the words being spoken.
 *
 * Much more accurate than spectral analysis since we know the exact
 * text from llm_token events.
 */

// Oculus viseme for each phoneme group
type VisemeKey = keyof VisemeWeights;

interface VisemeEntry {
  viseme: VisemeKey;
  /** Relative weight for duration (longer sounds get more time) */
  weight: number;
}

// ── Grapheme-to-Viseme rules ──────────────────────────────────────
// Ordered longest-first so multi-char patterns match before single chars.
// Maps English letter patterns to Oculus visemes.
const GRAPHEME_RULES: [RegExp, VisemeKey, number][] = [
  // Silence / pauses
  [/^[.,;:!?\-–—…]+/, "viseme_sil", 0.6],
  [/^\s+/, "viseme_sil", 0.3],

  // Multi-character patterns (order matters — longest first)
  [/^th/i, "viseme_TH", 1.0],
  [/^sh/i, "viseme_CH", 1.0],
  [/^ch/i, "viseme_CH", 1.0],
  [/^ph/i, "viseme_FF", 1.0],
  [/^wh/i, "viseme_U", 0.8],
  [/^ck/i, "viseme_kk", 0.8],
  [/^ng/i, "viseme_nn", 1.0],
  [/^oo/i, "viseme_O", 1.2],
  [/^ee/i, "viseme_I", 1.2],
  [/^ea/i, "viseme_I", 1.0],
  [/^ou/i, "viseme_U", 1.0],
  [/^ow/i, "viseme_U", 1.0],
  [/^ai/i, "viseme_E", 1.0],
  [/^ay/i, "viseme_E", 1.0],
  [/^ey/i, "viseme_E", 1.0],
  [/^igh/i, "viseme_aa", 1.2],
  [/^tion/i, "viseme_CH", 1.2],
  [/^sion/i, "viseme_CH", 1.2],

  // Single consonants
  [/^[pb]/i, "viseme_PP", 0.7],
  [/^[m]/i, "viseme_PP", 0.9],
  [/^[fv]/i, "viseme_FF", 0.8],
  [/^[sz]/i, "viseme_SS", 0.8],
  [/^[td]/i, "viseme_DD", 0.6],
  [/^[n]/i, "viseme_nn", 0.7],
  [/^[l]/i, "viseme_nn", 0.7],
  [/^[r]/i, "viseme_RR", 0.8],
  [/^[kg]/i, "viseme_kk", 0.7],
  [/^[j]/i, "viseme_CH", 0.8],
  [/^[w]/i, "viseme_U", 0.7],
  [/^[y]/i, "viseme_I", 0.6],
  [/^[h]/i, "viseme_sil", 0.4],
  [/^[x]/i, "viseme_kk", 0.9],
  [/^[q]/i, "viseme_kk", 0.7],

  // Vowels
  [/^[a]/i, "viseme_aa", 1.0],
  [/^[e]/i, "viseme_E", 0.9],
  [/^[i]/i, "viseme_I", 0.9],
  [/^[o]/i, "viseme_O", 1.0],
  [/^[u]/i, "viseme_U", 1.0],

  // Fallback for any other character
  [/^./, "viseme_sil", 0.2],
];

/**
 * Convert text to a sequence of viseme entries.
 */
export function textToVisemeSequence(text: string): VisemeEntry[] {
  const result: VisemeEntry[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    for (const [pattern, viseme, weight] of GRAPHEME_RULES) {
      const match = remaining.match(pattern);
      if (match) {
        // Merge consecutive same visemes (smoother)
        const last = result[result.length - 1];
        if (last && last.viseme === viseme) {
          last.weight += weight * 0.5; // Diminishing return for repeats
        } else {
          result.push({ viseme, weight });
        }
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      remaining = remaining.slice(1); // Skip unknown char
    }
  }

  return result;
}

// ── VisemeTimeline ────────────────────────────────────────────────

interface TimedViseme {
  viseme: VisemeKey;
  startTime: number;
  endTime: number;
}

export class VisemeTimeline {
  private entries: TimedViseme[] = [];
  private totalDuration = 0;

  /**
   * Build a timeline from text and total audio duration (seconds).
   */
  build(text: string, durationSeconds: number) {
    const sequence = textToVisemeSequence(text);
    this.totalDuration = durationSeconds;

    if (sequence.length === 0 || durationSeconds <= 0) {
      this.entries = [];
      return;
    }

    // Calculate total weight
    const totalWeight = sequence.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight <= 0) {
      this.entries = [];
      return;
    }

    // Distribute time proportionally
    let currentTime = 0;
    this.entries = sequence.map((entry) => {
      const duration = (entry.weight / totalWeight) * durationSeconds;
      const timed: TimedViseme = {
        viseme: entry.viseme,
        startTime: currentTime,
        endTime: currentTime + duration,
      };
      currentTime += duration;
      return timed;
    });
  }

  /**
   * Append more text and extend the timeline duration.
   * Used when audio buffers arrive incrementally.
   */
  extend(additionalText: string, additionalDuration: number) {
    if (additionalDuration <= 0 || !additionalText) return;

    const sequence = textToVisemeSequence(additionalText);
    if (sequence.length === 0) return;

    const totalWeight = sequence.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight <= 0) return;

    const startTime = this.totalDuration;
    let currentTime = startTime;

    for (const entry of sequence) {
      const duration = (entry.weight / totalWeight) * additionalDuration;
      this.entries.push({
        viseme: entry.viseme,
        startTime: currentTime,
        endTime: currentTime + duration,
      });
      currentTime += duration;
    }

    this.totalDuration += additionalDuration;
  }

  /**
   * Get interpolated viseme weights at a given time (seconds from start).
   * Returns smooth blended weights with crossfade between visemes.
   */
  getWeightsAtTime(time: number): VisemeWeights {
    const weights: VisemeWeights = { ...DEFAULT_VISEME_WEIGHTS };

    if (this.entries.length === 0 || time < 0) {
      return weights;
    }

    // Clamp to timeline
    if (time >= this.totalDuration) {
      weights.viseme_sil = 1;
      return weights;
    }

    // Find current and next viseme
    let currentIdx = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (time >= this.entries[i].startTime && time < this.entries[i].endTime) {
        currentIdx = i;
        break;
      }
      if (i === this.entries.length - 1) currentIdx = i;
    }

    const current = this.entries[currentIdx];
    const next = this.entries[currentIdx + 1];

    // Calculate blend progress within current viseme
    const entryDuration = current.endTime - current.startTime;
    const progress = entryDuration > 0
      ? (time - current.startTime) / entryDuration
      : 0;

    // Current viseme is dominant
    // Use cosine interpolation for smooth transitions
    const CROSSFADE = 0.3; // 30% of duration spent transitioning

    weights.viseme_sil = 0; // Reset silence

    if (progress > (1 - CROSSFADE) && next) {
      // Crossfading to next viseme
      const fadeProgress = (progress - (1 - CROSSFADE)) / CROSSFADE;
      const smoothFade = 0.5 - 0.5 * Math.cos(fadeProgress * Math.PI);

      weights[current.viseme] = (1 - smoothFade) * 0.8;
      weights[next.viseme] = smoothFade * 0.8;
    } else {
      // Fully in current viseme
      weights[current.viseme] = 0.8;
    }

    // Add jaw openness — vowels open more, consonants less
    const vowelVisemes: VisemeKey[] = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"];
    const isVowel = vowelVisemes.includes(current.viseme);
    const jawBase = isVowel ? 0.6 : 0.25;
    // Add subtle variation to avoid robotic look
    const jawVariation = Math.sin(time * 15) * 0.05;
    weights.viseme_sil = Math.max(0, weights.viseme_sil);

    // Store jaw openness in the sil channel as a secondary signal
    // (The model component reads mouthOpenness from the Avatar3DState)

    return weights;
  }

  /**
   * Get mouth openness at time (0-1). Vowels → open, consonants → less open.
   */
  getMouthOpennessAtTime(time: number): number {
    if (this.entries.length === 0 || time < 0 || time >= this.totalDuration) {
      return 0;
    }

    let currentIdx = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (time >= this.entries[i].startTime && time < this.entries[i].endTime) {
        currentIdx = i;
        break;
      }
    }

    const current = this.entries[currentIdx];

    const opennessMap: Partial<Record<VisemeKey, number>> = {
      viseme_sil: 0.0,
      viseme_PP: 0.1,   // lips closed (p, b, m)
      viseme_FF: 0.2,   // lower lip to teeth (f, v)
      viseme_TH: 0.25,  // tongue between teeth
      viseme_DD: 0.3,   // tongue tap (t, d)
      viseme_kk: 0.3,   // back of tongue (k, g)
      viseme_CH: 0.3,   // sh, ch
      viseme_SS: 0.2,   // sibilants (s, z)
      viseme_nn: 0.25,  // nasal (n, l)
      viseme_RR: 0.35,  // r
      viseme_aa: 0.75,  // open vowel (a)
      viseme_E: 0.55,   // mid vowel (e)
      viseme_I: 0.4,    // close vowel (i, ee)
      viseme_O: 0.65,   // round vowel (o)
      viseme_U: 0.5,    // round close vowel (u, oo)
    };

    const base = opennessMap[current.viseme] ?? 0.3;

    // Smooth variation to avoid robotic look
    const variation = Math.sin(time * 12) * 0.08;
    return Math.max(0, Math.min(1, base + variation));
  }

  /** Reset the timeline */
  reset() {
    this.entries = [];
    this.totalDuration = 0;
  }

  get duration() {
    return this.totalDuration;
  }

  get length() {
    return this.entries.length;
  }
}
