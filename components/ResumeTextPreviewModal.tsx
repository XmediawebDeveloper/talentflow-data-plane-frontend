'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Eye, Download, FileText, Loader2 } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';
import { Skeleton } from '@/components/ui/skeleton';
import { extractLocalResumeText } from '@/lib/utils/localResumeText';
import { toast } from 'sonner';

interface ResumeTextPreviewModalProps {
  /** Resume (or version) id — a version is a resume record in its own right.
   *  Optional: a file that isn't saved yet has no id, and passes its own
   *  content through `localFile` instead. */
  resumeId?: string;
  /** Heading, e.g. "Arvind Nair" or "Version 2". */
  title: string;
  /** Sub-heading, usually the file name. */
  subtitle?: string;
  /** Text already to hand; skips the fetch when provided. */
  text?: string;
  /** Fallback rendering for a local file whose text cannot be read — a PDF
   *  object URL. Only reached once extraction of `localFile` has failed. */
  documentUrl?: string;
  /** A file with no server record yet (a refused upload). Its text is read in
   *  the browser so it renders as a formatted page, exactly like a stored
   *  resume's `extracted_text`. */
  localFile?: Blob;
  /** Replaces the id-based download — a local file downloads from memory. */
  onDownload?: () => void;
  /** Stacking level for the overlay. Defaults to `z-50`, which sits above the
   *  page and ties with the z-50 dialogs this preview is usually opened from —
   *  a tie the preview wins because it renders after them. Callers whose own
   *  overlay sits higher than z-50 (e.g. DuplicateResumeModal at z-[60]) must
   *  pass a class above theirs, or the preview opens behind them. */
  zIndexClassName?: string;
  onClose: () => void;
}

/** A blob is a real PDF if it starts with the `%PDF` magic bytes — the same
 *  check the duplicate-resolution preview uses, since the preview/download
 *  endpoints below can return either a PDF or the original Word file. */
async function isPdfBlob(blob: Blob): Promise<boolean> {
  try {
    const header = await blob.slice(0, 5).text();
    return header.startsWith('%PDF');
  } catch {
    return false;
  }
}

/** A blob is a real Word file if it starts with the ZIP header ("PK", modern
 *  .docx/.pptx) or the OLE compound-file header (legacy .doc) — the two
 *  formats docx-preview can actually render. Anything else the preview/
 *  download endpoints return (e.g. a plain .txt upload, which the backend
 *  serves as-is when it isn't a PDF or Word file) is not renderable through
 *  docx-preview and must not be routed there, or it will always fail. */
async function isWordBlob(blob: Blob): Promise<boolean> {
  try {
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // 'P' 'K'
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    return isZip || isOle;
  } catch {
    return false;
  }
}

/** Lines treated as résumé section headings, so the preview keeps its shape. */
const SECTION_HEADERS = [
  'experience', 'work experience', 'employment', 'professional experience',
  'education', 'academic', 'qualifications',
  'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
  'summary', 'professional summary', 'objective', 'profile', 'about',
  'certifications', 'certificates', 'licenses',
  'projects', 'key projects',
  'achievements', 'accomplishments', 'awards',
  'languages', 'contact', 'personal', 'references', 'hobbies', 'interests',
];

/**
 * Reads a resume without leaving the screen you are on.
 *
 * The version lists used to open `/recruitment/resume-view/<id>` in a new tab,
 * which threw away whatever the dialog underneath was in the middle of — the
 * candidates you had ticked, the jobs you had chosen. Same document-style
 * rendering as the resume detail page's own preview, so it reads identically.
 */
export default function ResumeTextPreviewModal({
  resumeId,
  title,
  subtitle,
  text,
  documentUrl,
  localFile,
  onDownload,
  zIndexClassName = 'z-50',
  onClose,
}: ResumeTextPreviewModalProps) {
  /* A stored résumé is previewed from its actual file — PDF shown inline,
     Word rendered through docx-preview — fetched below via the `preview`
     endpoint (falling back to `download`). `extracted_text` is now only the
     last-resort fallback, for the rare case neither endpoint returns
     something renderable (e.g. a corrupted upload): reconstructing a page
     from extracted text loses the original's real formatting, which is what
     made this preview look wrong regardless of the source file's format.

     A file the server has never seen has no stored file to fetch, so its
     text is pulled out of the file here in the browser instead, rendered
     through the same extracted-text branch, giving "New Resume (Uploading)"
     the same format as "Existing Resume" beside it. `extractFailed` is the
     escape hatch there: an old binary .doc, or a scanned PDF with no text
     layer, renders as the document itself instead. */
  const [extractFailed, setExtractFailed] = useState(false);
  const hasLocalFile = !!localFile;
  const isStoredResumeOnly = !text && !documentUrl && !localFile && !!resumeId;
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(null);
  // Tracked alongside the url so the minimum paint hold below can scale with
  // it — a bigger/denser PDF takes the browser's native viewer visibly
  // longer to actually paint than a one-page text resume.
  const [resolvedPdfBytes, setResolvedPdfBytes] = useState(0);
  const [resolvedDocxBlob, setResolvedDocxBlob] = useState<Blob | null>(null);
  // Set when the fetched file turned out to be plain text (e.g. a .txt
  // upload) and its content was read directly — skips the extracted_text
  // fallback fetch below, which would otherwise overwrite it.
  const [resolvedAsText, setResolvedAsText] = useState(false);
  const [documentFetchDone, setDocumentFetchDone] = useState(false);
  const effectiveDocumentUrl = documentUrl || resolvedPdfUrl;
  /* A caller-supplied `documentUrl` (a local file already identified as a
     real PDF — see DuplicateResumeModal's `isPdf` check) wins immediately,
     same as a resolved one: there's no reason to wait on text extraction, or
     prefer it, when the actual file is already known renderable. */
  const documentMode = !text && (!!documentUrl || (hasLocalFile ? extractFailed : (!!effectiveDocumentUrl || !!resolvedDocxBlob)));
  const [content, setContent] = useState(text || '');
  const [loading, setLoading] = useState(!text && (hasLocalFile || isStoredResumeOnly));
  const docxContainerRef = useRef<HTMLDivElement>(null);
  /* The PDF itself still has to paint once the iframe's src is set — the
     browser's own PDF viewer renders a solid black frame for a beat before
     the document appears. The skeleton above only covers the fetch; this
     covers that second gap so the black frame is never the thing on screen.

     The iframe's `onLoad` alone isn't enough: for a blob: URL it tends to
     fire as soon as the outer frame document exists, before the embedded
     PDF viewer has actually painted anything — so gating on it alone just
     moved the black flash a few milliseconds later instead of removing it.
     A short minimum hold (`pdfMinHoldElapsed`) covers that gap; the spinner
     only clears once BOTH it and `onLoad` have fired, whichever is later —
     so a slow network load still waits on the real `onLoad`. */
  const [pdfIframeLoaded, setPdfIframeLoaded] = useState(false);
  const [pdfMinHoldElapsed, setPdfMinHoldElapsed] = useState(false);
  const pdfFrameLoaded = pdfIframeLoaded && pdfMinHoldElapsed;
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setPdfIframeLoaded(false);
    setPdfMinHoldElapsed(false);
    if (!effectiveDocumentUrl) return;
    // A fixed 600ms was only ever long enough for a short, simple resume —
    // a denser or multi-page PDF can still be mid-paint well past that,
    // which is exactly what let the black placeholder frame through for
    // some résumés and not others. Scale the floor with the file size
    // (resolvedPdfBytes is 0 for a caller-supplied documentUrl, which keeps
    // the original 600ms there), capped so a huge file doesn't hold the
    // spinner needlessly long.
    const holdMs = Math.min(2400, 600 + Math.round(resolvedPdfBytes / 1024) * 2);
    const timer = setTimeout(() => setPdfMinHoldElapsed(true), holdMs);
    return () => clearTimeout(timer);
  }, [effectiveDocumentUrl, resolvedPdfBytes]);
  // The hold above is a best-effort estimate, not a real signal that the
  // native viewer has painted — Chromium's built-in PDF viewer has a known
  // quirk where it can still be showing its black placeholder after `onLoad`
  // fires and the estimated hold elapses, and observed in production, that gap
  // can run several seconds past the hold for a dense resume, not just a beat.
  // One reflow at the moment of reveal can land before the viewer is actually
  // ready to repaint and do nothing, so it's repeated on a short schedule
  // instead of fired once — cheap (a 1px width flicker, not a visible layout
  // shift) and each attempt is a fresh chance to catch it.
  useEffect(() => {
    if (!pdfFrameLoaded) return;
    const el = pdfIframeRef.current;
    if (!el) return;
    const nudge = () => {
      const prevWidth = el.style.width;
      requestAnimationFrame(() => {
        el.style.width = 'calc(100% - 1px)';
        requestAnimationFrame(() => {
          el.style.width = prevWidth;
        });
      });
    };
    const timers = [0, 500, 1200, 2200, 3500].map(delay => setTimeout(nudge, delay));
    return () => timers.forEach(clearTimeout);
  }, [pdfFrameLoaded]);

  /* Same gap, different renderer: docx-preview fills `docxContainerRef`
     imperatively (its own async import plus a DOM render pass), so the
     container sits empty — no skeleton, no spinner — until that finishes.
     `docxReady` covers exactly that window. */
  const [docxReady, setDocxReady] = useState(false);

  useEffect(() => {
    if (!isStoredResumeOnly) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    const resolveBlob = async (blob: Blob) => {
      if (await isPdfBlob(blob)) {
        objectUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (cancelled) return false;
        setResolvedPdfUrl(objectUrl);
        setResolvedPdfBytes(blob.size);
        return true;
      }
      if (await isWordBlob(blob)) {
        if (cancelled) return false;
        setResolvedDocxBlob(blob);
        return true;
      }
      // Neither PDF nor Word — plain text (e.g. a .txt upload). The blob IS
      // the content, so render it directly instead of making a second request
      // for the resume's stored extracted_text.
      const asText = await blob.text();
      if (cancelled) return false;
      setContent(asText);
      setResolvedAsText(true);
      return true;
    };

    (async () => {
      let resolved = false;
      try {
        resolved = await resolveBlob(await resumeService.preview(resumeId!));
      } catch {
        try {
          resolved = await resolveBlob(await resumeService.download(resumeId!));
        } catch {
          resolved = false;
        }
      }
      if (cancelled) return;
      // Only clear loading on success — on failure, leave it true so the
      // skeleton persists seamlessly into the extracted_text fallback below,
      // which clears it once that settles.
      if (resolved) setLoading(false);
      setDocumentFetchDone(true);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [isStoredResumeOnly, resumeId]);

  useEffect(() => {
    if (text || documentMode || resolvedAsText || !resumeId) {
      if (text) setContent(text);
      return;
    }
    // Wait for the real-document fetch above to settle before falling back
    // to extracted_text, so a slow-but-successful preview never loses a race
    // against the fallback and gets replaced by the worse rendering.
    if (isStoredResumeOnly && !documentFetchDone) return;
    let cancelled = false;
    setLoading(true);
    resumeService
      .get(resumeId)
      .then(detail => {
        if (!cancelled) setContent(detail?.extracted_text || '');
      })
      .catch(() => {
        if (!cancelled) setContent('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId, text, documentMode, resolvedAsText, isStoredResumeOnly, documentFetchDone]);

  /* docx-preview is imported inside this handler, not at the top of the file.
     It reaches for the DOM as it loads, which is why every other component that
     renders Word documents pulls it in through `dynamic(..., { ssr: false })`.
     This modal, by contrast, is a plain static import in a dozen places — so a
     top-level import here dragged the dependency into all of their server
     bundles. Loading it on demand keeps it out of the module graph until a Word
     file is actually opened, in the browser, where it works. */
  const renderDocx = useCallback(async (blob: Blob) => {
    if (!docxContainerRef.current) return;
    setDocxReady(false);
    docxContainerRef.current.innerHTML = '';
    try {
      const { renderAsync } = await import('docx-preview');
      if (!docxContainerRef.current) return;
      await renderAsync(blob, docxContainerRef.current, undefined, {
        className: 'docx-preview-wrapper',
        // Kept true even though the wrapper's grey mat and page shadow are
        // then styled away in globals.css: with inWrapper false, docx-preview
        // switches its style root from `.docx-preview-wrapper-wrapper` to
        // `:root`, emitting the document's counter-reset and image custom
        // properties globally. Scoped styles are worth one neutralised div.
        inWrapper: true,
        // Without these, every section carries the Word file's print geometry
        // as inline styles — `width: 8.5in` (wider than this 672px card, so
        // the text was clipped mid-word behind a horizontal scrollbar) and
        // `min-height: 11in` (which padded the card far below the last line).
        // The page's inch-wide margins arrive as inline padding and have no
        // option to suppress; `.tf-docx-preview` in globals.css handles those.
        ignoreWidth: true,
        ignoreHeight: true,
        // Page breaks split the document into separate section boxes, which
        // only read as pages when the print geometry above is intact. Without
        // it they are arbitrary gaps, so the résumé flows continuously —
        // matching the extracted-text preview it sits beside.
        breakPages: false,
      });
    } catch {
      if (!docxContainerRef.current) return;
      docxContainerRef.current.innerHTML =
        '<p style="color:var(--raw-6b7280);font-size:14px;text-align:center;padding:24px">Could not render this document. Download it to view the original file.</p>';
    } finally {
      if (docxContainerRef.current) setDocxReady(true);
    }
  }, []);

  /* Read the upload's own text so it can render as a formatted page. Only if
     that is impossible does the raw document render below take over. */
  useEffect(() => {
    if (!localFile || text) return;
    // No setLoading(true) here — `loading` already initialises to true for a
    // localFile, and this effect never re-runs for a given preview (the modal
    // is unmounted and remounted per file), so setting it would only add a
    // cascading render.
    let cancelled = false;
    extractLocalResumeText(localFile)
      .then(extracted => {
        if (!cancelled) setContent(extracted);
      })
      .catch(() => {
        if (!cancelled) setExtractFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localFile, text]);

  /* Only a file that has no PDF fallback URL — an unreadable Word document —
     goes through docx-preview. A PDF falls back to its own object URL below. */
  useEffect(() => {
    if (localFile && extractFailed && !documentUrl) renderDocx(localFile);
  }, [localFile, extractFailed, documentUrl, renderDocx]);

  /* A stored résumé whose fetched file turned out to be a Word document
     (the preview/download endpoints didn't convert it to PDF). */
  useEffect(() => {
    if (resolvedDocxBlob) renderDocx(resolvedDocxBlob);
  }, [resolvedDocxBlob, renderDocx]);

  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!resumeId) return;
    try {
      toast.loading('Downloading...', { id: 'resume-preview-download' });
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = subtitle || `${title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Downloaded', { id: 'resume-preview-download' });
    } catch {
      toast.error('Download failed', { id: 'resume-preview-download' });
    }
  };

  const lines = content.split('\n');
  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 ${zIndexClassName}`}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title truncate">{title}</h2>
              {subtitle && <p className="tf-body-muted truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Nothing to download when there is neither a stored record nor a
                caller-supplied handler — an inert button would just lie. */}
            {(resumeId || onDownload) && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Document */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 p-4 sm:p-6">
          {documentMode ? (
            effectiveDocumentUrl ? (
              /* Two things made this read as a raw file viewer rather than the
                 clean page the existing-resume preview shows:
                 - h-[70dvh] iframe inside a min-h-full card left a band of empty
                   white below the document and gave the preview two competing
                   scrollbars. An iframe cannot report its content height, so
                   the card fills the mat exactly and the PDF scrolls inside it.
                 - the browser's own PDF chrome (grey bar, page thumbnails, zoom
                   controls), hidden with #toolbar=0&navpanes=0. */
              <div className="relative bg-white rounded-lg shadow-sm border border-gray-200 max-w-2xl mx-auto h-full overflow-hidden">
                {!pdfFrameLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                  </div>
                )}
                <iframe
                  ref={pdfIframeRef}
                  src={`${effectiveDocumentUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                  className={`w-full h-full border-0 ${pdfFrameLoaded ? '' : 'invisible'}`}
                  title={title}
                  onLoad={() => setPdfIframeLoaded(true)}
                />
              </div>
            ) : (
              /* A Word file renders as real DOM, so it gets the identical page
                 card the extracted-text branch below uses — same padding, same
                 max width, body does the scrolling. `tf-docx-preview` strips
                 the Word page geometry and docx-preview's own grey mat, so the
                 document reflows into this card instead of overflowing it at
                 its 8.5in print width. See app/globals.css. */
              <div className="relative max-w-2xl mx-auto h-full">
                {!docxReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white rounded-lg border border-gray-200">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                  </div>
                )}
                <div
                  ref={docxContainerRef}
                  className={`tf-docx-preview bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 min-h-full ${docxReady ? '' : 'invisible'}`}
                />
              </div>
            )
          ) : loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 max-w-2xl mx-auto min-h-full space-y-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : content ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 max-w-2xl mx-auto min-h-full min-w-0 overflow-x-hidden">
              {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={idx} className="h-3" />;

                const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                const isHeader =
                  SECTION_HEADERS.some(h => lower === h || lower.startsWith(h + ' ') || lower.endsWith(' ' + h)) &&
                  trimmed.length < 50;

                if (isHeader) {
                  return (
                    <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide break-words [overflow-wrap:anywhere]">
                      {trimmed}
                    </h3>
                  );
                }

                // The first line of a résumé is almost always the name.
                if (idx === firstNonEmpty) {
                  return <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1 break-words [overflow-wrap:anywhere]">{trimmed}</h2>;
                }

                if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                  return <p key={idx} className="tf-body leading-relaxed pl-4 mb-0.5 break-words [overflow-wrap:anywhere]">{trimmed}</p>;
                }

                return <p key={idx} className="tf-body leading-relaxed mb-0.5 break-words [overflow-wrap:anywhere]">{trimmed}</p>;
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full flex flex-col items-center justify-center text-center">
              <FileText className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-900">Preview not available</p>
              <p className="tf-body-muted mt-1">Download the resume to view the original file.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
