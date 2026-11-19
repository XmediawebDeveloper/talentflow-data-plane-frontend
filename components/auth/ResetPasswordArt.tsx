'use client';

/**
 * Envelope-and-shield spot illustration for the reset-password dialog's header.
 *
 * Drawn as inline SVG rather than shipped as an image: it is small, it has to sit
 * flush against the dialog's own surface with no baked-in background, and it has
 * to follow the theme. Every fill comes from a class rather than a hard-coded hex
 * (see .tf-fp-art in authTheme.ts) so the artwork re-colours from the same
 * --tf-* tokens as the rest of the auth surfaces in both light and dark.
 */
export default function ResetPasswordArt() {
  return (
    <div className="tf-fp-art" aria-hidden="true">
      <svg viewBox="0 0 132 100" role="presentation" focusable="false">
        <defs>
          <linearGradient id="tf-fp-shield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-blue)" />
            <stop offset="100%" stopColor="var(--brand-blue-2)" />
          </linearGradient>
          <clipPath id="tf-fp-envelope">
            <rect x="28" y="50" width="76" height="40" rx="6" />
          </clipPath>
        </defs>

        {/* Soft backdrop */}
        <circle className="fp-blob" cx="68" cy="44" r="38" />
        <circle className="fp-blob" cx="42" cy="62" r="20" />

        {/* Document rising out of the envelope */}
        <rect className="fp-paper" x="47" y="6" width="38" height="52" rx="4" />
        <rect className="fp-line" x="54" y="46" width="24" height="3" rx="1.5" />
        <rect className="fp-line" x="54" y="52" width="16" height="3" rx="1.5" />

        {/* Shield + padlock */}
        <path
          fill="url(#tf-fp-shield)"
          d="M66 12l13 4.6v10.6c0 8.4-5.6 13.6-13 16.4-7.4-2.8-13-8-13-16.4V16.6z"
        />
        <rect className="fp-lock" x="62.2" y="27.4" width="7.6" height="7" rx="1.6" />
        <path
          className="fp-lock-shackle"
          d="M63.8 27.4v-2.3a2.2 2.2 0 0 1 4.4 0v2.3"
        />

        {/* Envelope */}
        <g clipPath="url(#tf-fp-envelope)">
          <rect className="fp-env-back" x="28" y="50" width="76" height="40" />
          <path className="fp-env-front" d="M28 94 66 54 104 94z" />
        </g>

        {/* Sparkles, paper plane and the trailing swirl */}
        <path className="fp-spark" d="M16 22l1.7 4.3 4.3 1.7-4.3 1.7L16 34l-1.7-4.3-4.3-1.7 4.3-1.7z" />
        <path className="fp-spark" d="M108 12l1.3 3.3 3.3 1.3-3.3 1.3-1.3 3.3-1.3-3.3-3.3-1.3 3.3-1.3z" />
        <circle className="fp-spark" cx="26" cy="52" r="2.2" />
        <path className="fp-plane" d="M126 44l-18 8.4 7.2 2.4 2.4 7.2z" />
        <path className="fp-swirl" d="M104 74c7 4 12 2.6 15-2.4" />
        <circle className="fp-swirl-ring" cx="112" cy="82" r="4" />
        <path className="fp-burst" d="M100 26l5-5M104 32l6-2M99 20l2-6" />
      </svg>
    </div>
  );
}
