'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export interface ChatAttachment {
  url: string;
  name?: string;
}

/**
 * Full-screen in-page viewer for a chat image attachment, with Download and
 * Open-in-new-tab. Esc, the ✕ or a click on the backdrop closes it.
 */
export default function ChatAttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: ChatAttachment | null;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [attachment, onClose]);

  if (!attachment || typeof document === 'undefined') return null;

  const fileName = attachment.name || attachment.url.split('/').pop()?.split('?')[0] || 'attachment';

  // `<a download>` is ignored for cross-origin files, so fetch the bytes and
  // save them from a blob; if the file host blocks that (CORS), open it instead.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(String(res.status));
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');
      toast.info('Opened in a new tab — save it from there.');
    } finally {
      setDownloading(false);
    }
  };

  const barButton =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
      className="fixed inset-0 z-[200] flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-5 sm:py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{fileName}</p>
        <button type="button" onClick={handleDownload} disabled={downloading} className={`${barButton} disabled:cursor-wait`} title="Download">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">Download</span>
        </button>
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className={barButton} title="Open in new tab">
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Open</span>
        </a>
        <button type="button" onClick={onClose} className={`${barButton} w-9 px-0`} aria-label="Close" title="Close (Esc)">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={fileName}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-in zoom-in-95 duration-200"
        />
      </div>
    </div>,
    document.body,
  );
}
