/**
 * Reads the text out of a résumé file that the server has never seen.
 *
 * A résumé already in the database is previewed from its stored
 * `extracted_text`, which is what gives the preview its formatted-page look —
 * name, section headings, bullets. An upload that was refused as a duplicate
 * has no record to read that from, so it used to fall back to rendering the
 * raw document, which looked nothing like the resume beside it. Pulling the
 * text out here in the browser lets both sides render through the same code.
 *
 * The output deliberately mirrors what a server-side extraction produces: one
 * line per paragraph, tabs preserved, no styling.
 */

/** WordprocessingML namespace — the elements carrying a .docx's actual text. */
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** More than one blank line in a row is layout, not content. */
const collapseBlankLines = (text: string): string =>
  text.replace(/\n{3,}/g, '\n\n').trim();

/**
 * One paragraph's text. Children are visited in document order so runs, tabs
 * and manual line breaks come out in the order they were authored — reading
 * `textContent` off the paragraph instead would run every word together
 * wherever the author used a tab or a soft break.
 */
const paragraphText = (paragraph: Element): string => {
  let out = '';
  const nodes = paragraph.getElementsByTagNameNS(W_NS, '*');

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    switch (node.localName) {
      case 't':
        out += node.textContent ?? '';
        break;
      case 'tab':
        out += '\t';
        break;
      // A manual line break inside a paragraph.
      case 'br':
      case 'cr':
        out += '\n';
        break;
      default:
        break;
    }
  }

  return out;
};

/** Two text runs on the same visual line never differ by more than a point or
 *  two in their baseline; the next line down differs by a whole line height. */
const SAME_LINE_TOLERANCE = 2;

/** Horizontal gap, in points, wide enough to mean a space rather than kerning. */
const WORD_GAP = 1;

/** True for a PDF — the format's four-byte "%PDF" signature. */
const isPdf = async (blob: Blob): Promise<boolean> => {
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
};

interface TextPart {
  x: number;
  width: number;
  str: string;
}

/** Text runs sharing a baseline, left to right, spaced where the gaps are. */
const joinLine = (parts: TextPart[]): string => {
  const ordered = [...parts].sort((a, b) => a.x - b.x);

  let out = '';
  let cursor: number | null = null;

  for (const part of ordered) {
    if (cursor !== null && part.x - cursor > WORD_GAP && !/\s$/.test(out) && !/^\s/.test(part.str)) {
      out += ' ';
    }
    out += part.str;
    cursor = part.x + part.width;
  }

  return out.trimEnd();
};

/**
 * Extracts text from a PDF, one line per visual line.
 *
 * pdf.js hands back positioned runs rather than lines, so runs are bucketed by
 * baseline and ordered left to right within each. Reading them in the order
 * they happen to appear in the content stream would scramble any résumé laid
 * out in columns.
 */
const extractPdfText = async (blob: Blob): Promise<string> => {
  const pdfjs = await import('pdfjs-dist');

  /* pdf.js parses in a web worker. `new URL(..., import.meta.url)` is how the
     bundler is told to emit that worker as an asset and hand back its real
     URL — a bare specifier would be looked up at runtime and 404. If this ever
     fails to resolve, getDocument rejects and the caller falls back to
     rendering the document itself, so a broken worker degrades rather than
     breaking the preview. */
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;

  // pdf.js 6: the loading task, not the document, is what gets destroyed.
  const loadingTask = pdfjs.getDocument({ data: await blob.arrayBuffer() });
  const doc = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      const lines: { y: number; parts: TextPart[] }[] = [];

      for (const item of content.items) {
        // The other kind of item is a marked-content boundary, which has no text.
        if (!('str' in item)) continue;

        const x = item.transform[4];
        const y = item.transform[5];

        let line = lines.find(candidate => Math.abs(candidate.y - y) <= SAME_LINE_TOLERANCE);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x, width: item.width ?? 0, str: item.str });
      }

      // Down the page: PDF y grows upwards, so the largest baseline is the top line.
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines.map(line => joinLine(line.parts)).join('\n'));

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = collapseBlankLines(pages.join('\n'));
  if (!text) {
    // A scanned résumé is images with no text layer — nothing to format.
    throw new Error('PDF contained no extractable text');
  }
  return text;
};

/** True for the OOXML container .docx uses — a plain zip starting "PK". */
const isZip = async (blob: Blob): Promise<boolean> => {
  const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return header[0] === 0x50 && header[1] === 0x4b;
};

/**
 * Extracts plain text from a local .pdf, .docx or .txt file.
 *
 * Throws when the file is a format this cannot read (the older binary .doc) or
 * carries no text layer (a scanned résumé), so the caller can fall back to
 * rendering the document itself.
 */
export async function extractLocalResumeText(blob: Blob): Promise<string> {
  // A plain-text résumé is already in the target format.
  if (blob.type === 'text/plain') {
    return collapseBlankLines(await blob.text());
  }

  if (await isPdf(blob)) {
    return extractPdfText(blob);
  }

  if (!(await isZip(blob))) {
    throw new Error('Unrecognised format — nothing to extract');
  }

  // Loaded on demand: this only runs when a Word file is actually opened, and
  // the preview modal is a static import in a dozen places that never need it.
  const { default: JSZip } = await import('jszip');
  // An ArrayBuffer rather than the Blob itself: JSZip's Blob path goes through
  // FileReader, which is browser-only and needless here when the bytes are
  // already to hand.
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const entry = zip.file('word/document.xml');
  if (!entry) {
    throw new Error('No word/document.xml — not a Word document');
  }

  const parsed = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed document.xml');
  }

  // Paragraphs come back in document order, including the ones inside table
  // cells, so a résumé laid out as a table still reads top to bottom.
  const paragraphs = parsed.getElementsByTagNameNS(W_NS, 'p');

  const lines: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    lines.push(paragraphText(paragraphs[i]));
  }

  const text = collapseBlankLines(lines.join('\n'));
  if (!text) {
    throw new Error('Document contained no text');
  }
  return text;
}
