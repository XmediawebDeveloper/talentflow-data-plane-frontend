/**
 * Line-level text diffing for the version-comparison views.
 *
 * Lifted out of the resume-view page so the JD History comparison runs the same
 * algorithm rather than a second, subtly-different copy — the two views sit a
 * click apart and users read them as the same feature.
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  text: string;
  type: DiffLineType;
}

export interface UnifiedDiff {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
}

/**
 * Build a unified diff: added/removed/unchanged lines interleaved in reading
 * order. Uses an LCS table rather than a naive set difference so a line that
 * merely moved doesn't read as one deletion plus one insertion, and so the
 * surviving text stays in the order the document had it.
 *
 * Blank lines and surrounding whitespace are dropped before comparing —
 * reflowing a paragraph shouldn't register as a change.
 */
export function buildUnifiedDiff(olderText: string, newerText: string): UnifiedDiff {
  const normalize = (text: string) =>
    text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const olderLines = normalize(olderText || '');
  const newerLines = normalize(newerText || '');

  if (!olderText && !newerText) {
    return { lines: [], addedCount: 0, removedCount: 0, unchangedCount: 0 };
  }

  const olderLen = olderLines.length;
  const newerLen = newerLines.length;

  const dp: number[][] = Array.from({ length: olderLen + 1 }, () => Array(newerLen + 1).fill(0));
  for (let i = 1; i <= olderLen; i++) {
    for (let j = 1; j <= newerLen; j++) {
      if (olderLines[i - 1] === newerLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = olderLen, j = newerLen;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && olderLines[i - 1] === newerLines[j - 1]) {
      result.unshift({ text: olderLines[i - 1], type: 'unchanged' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newerLines[j - 1], type: 'added' });
      j--;
    } else {
      result.unshift({ text: olderLines[i - 1], type: 'removed' });
      i--;
    }
  }

  return {
    lines: result,
    addedCount: result.filter(l => l.type === 'added').length,
    removedCount: result.filter(l => l.type === 'removed').length,
    unchangedCount: result.filter(l => l.type === 'unchanged').length,
  };
}

/** One row of the side-by-side view. A null side is the blank spacer that keeps
 *  the two columns vertically aligned across an uneven edit. */
export interface DiffSidePair {
  left: DiffLine | null;
  right: DiffLine | null;
}

/**
 * Fold a unified diff into aligned left/right rows.
 *
 * Removals and additions are collected per run and zipped, so an edit that
 * replaces two lines with three shows as three rows rather than five — the
 * changed text lands beside what it replaced instead of below it.
 */
export function buildDiffSidePairs(lines: DiffLine[]): DiffSidePair[] {
  const pairs: DiffSidePair[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type === 'unchanged') {
      pairs.push({ left: lines[i], right: lines[i] });
      i++;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < lines.length && lines[i].type === 'removed') {
      removed.push(lines[i]);
      i++;
    }
    while (i < lines.length && lines[i].type === 'added') {
      added.push(lines[i]);
      i++;
    }

    const maxLen = Math.max(removed.length, added.length);
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        left: j < removed.length ? removed[j] : null,
        right: j < added.length ? added[j] : null,
      });
    }
  }

  return pairs;
}
