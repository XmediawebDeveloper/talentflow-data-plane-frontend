import DOMPurify from 'dompurify';

/**
 * Clean HTML that comes from the server (Terms, Privacy and other legal pages
 * authored in the admin CMS) before it goes into dangerouslySetInnerHTML.
 * Removes scripts, event handlers and javascript: links.
 *
 * DOMPurify needs a browser DOM and returns its input UNCHANGED without one,
 * so on the server this returns '' (the content renders after hydration).
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  if (typeof window === 'undefined' || !DOMPurify.isSupported) return '';
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
