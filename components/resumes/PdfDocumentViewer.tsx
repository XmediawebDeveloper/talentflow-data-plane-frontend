'use client';

import { useEffect, useRef } from 'react';
import { toExternalUrl } from '@/lib/utils/externalUrl';

interface PdfDocumentViewerProps {
  /** blob: or http(s) URL of the PDF. */
  url: string;
  /** Fired once every page has been drawn. */
  onLoaded?: () => void;
  /** Fired if pdf.js cannot open/render the file — caller falls back to the
   *  browser's native viewer. */
  onError?: (err: unknown) => void;
  className?: string;
}

/**
 * Renders a PDF with pdf.js instead of the browser's built-in viewer.
 *
 * Why: links inside Chrome's native PDF viewer (iframe) navigate the CURRENT
 * tab — clicking a candidate's GitHub/LinkedIn in the resume preview replaced
 * TalentFlow itself, and the page has no way to change that. Here each page is
 * painted to a canvas and every link annotation becomes a real <a
 * target="_blank">, so links always open in a new tab.
 */
export default function PdfDocumentViewer({ url, onLoaded, onError, className }: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Callbacks via refs so a parent re-render doesn't re-render the PDF.
  const onLoadedRef = useRef(onLoaded);
  const onErrorRef = useRef(onError);
  onLoadedRef.current = onLoaded;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let destroyDoc: (() => void) | undefined;

    const render = async () => {
      const pdfjs = await import('pdfjs-dist');
      // Same worker wiring as lib/utils/localResumeText.ts.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href;

      const task = pdfjs.getDocument({ url });
      destroyDoc = () => { void task.destroy(); };
      const doc = await task.promise;
      if (cancelled) return;

      container.replaceChildren();
      const cssWidth = Math.max(container.clientWidth, 320);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: cssWidth / base.width });

        const pageEl = document.createElement('div');
        pageEl.style.position = 'relative';
        pageEl.style.width = `${viewport.width}px`;
        pageEl.style.height = `${viewport.height}px`;
        pageEl.style.margin = '0 auto';
        if (pageNumber > 1) pageEl.style.borderTop = '1px solid #e5e7eb';

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.display = 'block';
        pageEl.appendChild(canvas);
        container.appendChild(pageEl);

        await page.render({
          canvas,
          canvasContext: canvas.getContext('2d')!,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
        if (cancelled) return;

        // Link annotations → clickable overlays that open in a new tab.
        const annotations = await page.getAnnotations({ intent: 'display' });
        for (const a of annotations as Array<Record<string, any>>) {
          if (a.subtype !== 'Link') continue;
          const href = toExternalUrl(a.url || a.unsafeUrl);
          if (!href || !Array.isArray(a.rect)) continue;
          const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = href;
          Object.assign(link.style, {
            position: 'absolute',
            left: `${Math.min(x1, x2)}px`,
            top: `${Math.min(y1, y2)}px`,
            width: `${Math.abs(x2 - x1)}px`,
            height: `${Math.abs(y2 - y1)}px`,
            cursor: 'pointer',
          });
          pageEl.appendChild(link);
        }
      }

      if (!cancelled) onLoadedRef.current?.();
    };

    render().catch(err => {
      if (!cancelled) onErrorRef.current?.(err);
    });

    return () => {
      cancelled = true;
      destroyDoc?.();
    };
  }, [url]);

  return <div ref={containerRef} className={className} />;
}
