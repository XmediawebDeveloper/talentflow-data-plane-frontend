'use client';

/**
 * Success mark for the password-reset confirmation step.
 *
 * The ring is an open arc rather than a closed circle: the tick starts inside
 * it and exits through the gap at the upper right, which is what the reference
 * draws. Fills and strokes come from .tf-ok-art in authTheme.ts so the mark
 * uses the same success tokens as the rest of the auth surfaces.
 */
export default function ResetSuccessArt() {
  return (
    <div className="tf-ok-art" aria-hidden="true">
      <svg viewBox="0 0 140 140" role="presentation" focusable="false">
        <circle className="ok-disc" cx="70" cy="70" r="50" />

        {/* Ring, left open between roughly -45deg and +20deg */}
        <path className="ok-ring" d="M91.9 48.1A31 31 0 1 0 99.1 80.6" />
        <path className="ok-tick" d="M56 71l11 11 28-38" />

        {/* Sparkles */}
        <path
          className="ok-spark"
          d="M15 23l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
        />
        <path
          className="ok-spark"
          d="M130 86l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
        />
        <path
          className="ok-spark"
          d="M11 94l1.7 4.3 4.3 1.7-4.3 1.7L11 106l-1.7-4.3L5 100l4.3-1.7z"
        />
        <circle className="ok-spark" cx="119" cy="21" r="2.5" />
        <circle className="ok-spark" cx="132" cy="45" r="2" />
        <circle className="ok-spark" cx="4" cy="68" r="2.5" />
        <circle className="ok-spark" cx="114" cy="112" r="2" />
      </svg>
    </div>
  );
}
