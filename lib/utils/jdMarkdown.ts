const CONNECTOR_WORDS = new Set([
  '&', 'and', 'or', 'of', 'to', 'for', 'the', 'a', 'an', 'in', 'on', 'with', 'at', 'by', 'its', 'their',
]);

const ACTION_VERB_RE = /^(Design|Develop|Write|Build|Create|Implement|Maintain|Manage|Lead|Work|Collaborate|Participate|Fix|Optimize|Test|Review|Ensure|Prepare|Provide|Support|Assist|Handle|Conduct|Perform|Execute|Analyze|Monitor|Collect|Recommend|Identify|Report|Coordinate|Communicate|Drive|Define|Evaluate|Assess|Deliver|Plan|Track|Update|Resolve|Document|Oversee|Establish|Improve|Facilitate|Negotiate|Allocate|Forecast|Validate|Respond)\b/i;
const MARKDOWN_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const MARKDOWN_BULLET_RE = /^\s*(?:[-*+]\s+|\d+\.\s+)/;
const BULLET_LIKE_RE = /^\s*(?:[-*+•]\s+|\d+[.)]\s+)/;

const cleanCell = (value: string): string => value.trim().replace(/\s+/g, ' ');

const normalizePipeRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cleanCell);
};

const formatPipeRow = (cells: string[], width: number): string => {
  const padded = [...cells];
  while (padded.length < width) padded.push('');
  return `| ${padded.map((cell) => cell.trim()).join(' | ')} |`;
};

const splitWhitespaceColumns = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.includes('\t')) {
    return trimmed.split(/\t+/).map(cleanCell).filter(Boolean);
  }
  return trimmed.split(/\s{2,}/).map(cleanCell).filter(Boolean);
};

const isExistingMarkdownTableRow = (line: string): boolean => normalizePipeRow(line).length >= 2;

const isLikelyPipeTableRow = (line: string): boolean => {
  const trimmed = line.trim();
  return Boolean(trimmed) && trimmed.includes('|') && normalizePipeRow(trimmed).length >= 2;
};

const isLikelyWhitespaceTableRow = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || MARKDOWN_BULLET_RE.test(trimmed) || trimmed.startsWith('#')) return false;
  return splitWhitespaceColumns(trimmed).length >= 2;
};

const isLikelyHeader = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;

  const withoutColon = trimmed.replace(/:\s*$/, '');
  const words = withoutColon.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8 || withoutColon.length > 65) return false;
  if (ACTION_VERB_RE.test(withoutColon)) return false;
  if (!/^[A-Z]/.test(withoutColon)) return false;

  const contentWords = words.filter((word) => !CONNECTOR_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, '')));
  if (contentWords.length === 0) return false;

  const uppercaseCount = contentWords.filter((word) => /^[A-Z]/.test(word)).length;
  return uppercaseCount >= Math.ceil(contentWords.length * 0.7) || /:\s*$/.test(trimmed);
};

const isLikelyBullet = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;
  if (MARKDOWN_BULLET_RE.test(trimmed)) return false;
  return ACTION_VERB_RE.test(trimmed);
};

const ensureBlankLine = (lines: string[]) => {
  if (lines.length > 0 && lines[lines.length - 1] !== '') {
    lines.push('');
  }
};

const normalizePipeTableBlock = (rawLines: string[]): string[] => {
  const rowCells = rawLines
    .filter((line) => !MARKDOWN_SEPARATOR_RE.test(line))
    .map(normalizePipeRow)
    .filter((cells) => cells.length >= 2);

  if (rowCells.length < 2) return rawLines;

  const width = Math.max(...rowCells.map((cells) => cells.length));
  const [header, ...body] = rowCells;
  return [
    formatPipeRow(header, width),
    formatPipeRow(Array.from({ length: width }, () => '---'), width),
    ...body.map((cells) => formatPipeRow(cells, width)),
  ];
};

const normalizeWhitespaceTableBlock = (rawLines: string[]): string[] | null => {
  const rows = rawLines
    .map(splitWhitespaceColumns)
    .filter((cells) => cells.length >= 2);

  if (rows.length < 2) return null;

  const width = rows[0].length;
  if (width < 2 || rows.some((cells) => cells.length !== width)) return null;

  const [header, ...body] = rows;
  return [
    formatPipeRow(header, width),
    formatPipeRow(Array.from({ length: width }, () => '---'), width),
    ...body.map((cells) => formatPipeRow(cells, width)),
  ];
};

export const stripEmptyCertificationSections = (text: string): string =>
  (text || '')
    .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
      match.toLowerCase().includes('none') ||
      match.toLowerCase().includes('none required') ||
      match.toLowerCase().includes('not required') ||
      match.toLowerCase().includes('n/a') ||
      match.trim().match(/^#+\s*Certifications\s*$/im)
        ? ''
        : match
    )
    .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
    .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
    .trim();

export const normalizeManualJDToMarkdown = (text: string): string => {
  const source = (text || '').replace(/\r\n/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const output: string[] = [];
  let previousWasHeader = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      ensureBlankLine(output);
      previousWasHeader = false;
      continue;
    }

    if (isLikelyPipeTableRow(trimmed)) {
      const block: string[] = [];
      let cursor = index;
      while (cursor < lines.length && isLikelyPipeTableRow(lines[cursor].trim())) {
        block.push(lines[cursor]);
        cursor += 1;
      }

      const tableLines = normalizePipeTableBlock(block);
      if (tableLines.length >= 3) {
        ensureBlankLine(output);
        output.push(...tableLines);
        output.push('');
        index = cursor - 1;
        previousWasHeader = false;
        continue;
      }
    }

    if (isLikelyWhitespaceTableRow(trimmed)) {
      const block: string[] = [];
      let cursor = index;
      const expectedWidth = splitWhitespaceColumns(lines[cursor]).length;
      while (cursor < lines.length) {
        const row = splitWhitespaceColumns(lines[cursor]);
        if (row.length !== expectedWidth || row.length < 2) break;
        block.push(lines[cursor]);
        cursor += 1;
      }

      const tableLines = normalizeWhitespaceTableBlock(block);
      if (tableLines) {
        ensureBlankLine(output);
        output.push(...tableLines);
        output.push('');
        index = cursor - 1;
        previousWasHeader = false;
        continue;
      }
    }

    if (trimmed.startsWith('#')) {
      ensureBlankLine(output);
      output.push(trimmed.replace(/\s+$/, ''));
      output.push('');
      previousWasHeader = true;
      continue;
    }

    if (isLikelyHeader(trimmed)) {
      ensureBlankLine(output);
      output.push(`## ${trimmed.replace(/^#+\s*/, '').replace(/:\s*$/, '')}`);
      output.push('');
      previousWasHeader = true;
      continue;
    }

    if (BULLET_LIKE_RE.test(trimmed)) {
      output.push(trimmed.replace(BULLET_LIKE_RE, '- '));
      previousWasHeader = false;
      continue;
    }

    if (isLikelyBullet(trimmed) || previousWasHeader) {
      output.push(`- ${trimmed}`);
      previousWasHeader = false;
      continue;
    }

    const previous = output[output.length - 1];
    if (
      previous &&
      previous !== '' &&
      !previous.startsWith('#') &&
      !MARKDOWN_BULLET_RE.test(previous) &&
      !isExistingMarkdownTableRow(previous)
    ) {
      output[output.length - 1] = `${previous} ${trimmed}`;
    } else {
      output.push(trimmed);
    }
    previousWasHeader = false;
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

