'use client';

/**
 * "Skip to main content" (accessibility §14): the first thing Tab reaches on a
 * dashboard page, so keyboard users can jump past the header and banners.
 * Visually hidden until it has focus; then a small pill in the top-left.
 *
 * Moves focus itself instead of following the #hash, so the URL (which some
 * pages read) is left alone. The href stays as the no-JavaScript fallback.
 * The target needs tabIndex={-1} to be focusable.
 */
export function SkipLink({ targetId = 'main-content', label = 'Skip to main content' }: { targetId?: string; label?: string }) {
  return (
    <a
      href={`#${targetId}`}
      onClick={(e) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[10050] focus:rounded-lg focus:bg-brand-blue focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
    >
      {label}
    </a>
  );
}
