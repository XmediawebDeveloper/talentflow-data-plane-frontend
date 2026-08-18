'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Eye, Download, FileText, Loader2 } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface ResumeTextPreviewModalProps {
  /** Resume (or version) id — a version is a resume record in its own right.
   *  Optional: a file that isn't saved yet has no id, and passes its own
   *  content through `documentUrl` / `docxBlob` instead. */
  resumeId?: string;
  /** Heading, e.g. "Arvind Nair" or "Version 2". */
  title: string;
  /** Sub-heading, usually the file name. */
  subtitle?: string;
  /** Text already to hand; skips the fetch when provided. */
  text?: string;
  /** Render this PDF in place of extracted text — for a file with no server
   *  record yet, where there is nothing to fetch text from. */
  documentUrl?: string;
  /** Same, for a Word document, rendered with docx-preview. */
  docxBlob?: Blob;
  /** Replaces the id-based download — a local file downloads from memory. */
  onDownload?: () => void;
  onClose: () => void;
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
  docxBlob,
  onDownload,
  onClose,
}: ResumeTextPreviewModalProps) {
  /* A file the server has never seen has no extracted text to show, so it is
     rendered as the document itself. The frame around it — header, download,
     grey mat, footer — stays the same either way, so the two previews in the
     duplicate dialog read as one thing. */
  const documentMode = !!(documentUrl || docxBlob);
  const [content, setContent] = useState(text || '');
  const [loading, setLoading] = useState(!text && !documentMode && !!resumeId);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text || documentMode || !resumeId) {
      if (text) setContent(text);
      return;
    }
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
  }, [resumeId, text, documentMode]);

  /* docx-preview is imported inside this handler, not at the top of the file.
     It reaches for the DOM as it loads, which is why every other component that
     renders Word documents pulls it in through `dynamic(..., { ssr: false })`.
     This modal, by contrast, is a plain static import in a dozen places — so a
     top-level import here dragged the dependency into all of their server
     bundles. Loading it on demand keeps it out of the module graph until a Word
     file is actually opened, in the browser, where it works. */
  const renderDocx = useCallback(async (blob: Blob) => {
    if (!docxContainerRef.current) return;
    docxContainerRef.current.innerHTML = '';
    try {
      const { renderAsync } = await import('docx-preview');
      if (!docxContainerRef.current) return;
      await renderAsync(blob, docxContainerRef.current, undefined, {
        className: 'docx-preview-wrapper',
        inWrapper: true,
        breakPages: true,
      });
    } catch {
      if (!docxContainerRef.current) return;
      docxContainerRef.current.innerHTML =
        '<p style="color:#6b7280;font-size:14px;text-align:center;padding:24px">Could not render this document. Download it to view the original file.</p>';
    }
  }, []);

  useEffect(() => {
    if (docxBlob) renderDocx(docxBlob);
  }, [docxBlob, renderDocx]);

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight truncate">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
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
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6">
          {documentMode ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-2xl mx-auto min-h-full overflow-hidden">
              {documentUrl ? (
                <iframe src={documentUrl} className="w-full h-[70vh] border-0" title={title} />
              ) : (
                <div ref={docxContainerRef} className="w-full overflow-auto p-4 sm:p-6" />
              )}
            </div>
          ) : loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
              <p className="text-sm text-gray-500">Loading resume...</p>
            </div>
          ) : content ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 max-w-2xl mx-auto min-h-full">
              {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={idx} className="h-3" />;

                const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                const isHeader =
                  SECTION_HEADERS.some(h => lower === h || lower.startsWith(h + ' ') || lower.endsWith(' ' + h)) &&
                  trimmed.length < 50;

                if (isHeader) {
                  return (
                    <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                      {trimmed}
                    </h3>
                  );
                }

                // The first line of a résumé is almost always the name.
                if (idx === firstNonEmpty) {
                  return <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1">{trimmed}</h2>;
                }

                if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                  return <p key={idx} className="text-sm text-gray-700 leading-relaxed pl-4 mb-0.5">{trimmed}</p>;
                }

                return <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-0.5">{trimmed}</p>;
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full flex flex-col items-center justify-center text-center">
              <FileText className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-900">Preview not available</p>
              <p className="text-sm text-gray-500 mt-1">Download the resume to view the original file.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
