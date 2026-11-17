'use client';

/**
 * Compact envelope spot illustration for the verification-code step.
 *
 * Deliberately reuses the .tf-fp-art class set from ResetPasswordArt rather
 * than carrying its own palette: same fills, same theme tokens, so the two
 * steps of the dialog read as one illustration family. Only the drawing
 * differs — a sealed letter showing the code, instead of the shield and
 * document of the email step.
 */
export default function VerifyCodeArt() {
  return (
    <div className="tf-fp-art tf-fp-art--sm" aria-hidden="true">
      <svg viewBox="0 0 104 84" role="presentation" focusable="false">
        <defs>
          <clipPath id="tf-vc-envelope">
            <rect x="14" y="30" width="62" height="42" rx="6" />
          </clipPath>
        </defs>

        {/* Letter lifting out of the envelope, carrying the code */}
        <rect className="fp-paper" x="26" y="4" width="38" height="38" rx="3" />
        <path className="fp-code" d="M35 20l1 2.6 2.6 1-2.6 1L35 27l-1-2.4-2.6-1 2.6-1z" />
        <path className="fp-code" d="M45 20l1 2.6 2.6 1-2.6 1L45 27l-1-2.4-2.6-1 2.6-1z" />
        <path className="fp-code" d="M55 20l1 2.6 2.6 1-2.6 1L55 27l-1-2.4-2.6-1 2.6-1z" />

        {/* Envelope */}
        <g clipPath="url(#tf-vc-envelope)">
          <rect className="fp-env-back" x="14" y="30" width="62" height="42" />
          <path className="fp-env-front" d="M14 76 45 34 76 76z" />
        </g>
        <path className="fp-env-flap" d="M14 34 45 12 76 34" />

        {/* Paper plane and its trail */}
        <path className="fp-plane" d="M100 30l-16 7.4 6.4 2.2 2.2 6.4z" />
        <path className="fp-swirl" d="M82 52c6 3.4 10.4 2.2 13-2" />
        <circle className="fp-swirl-ring" cx="88" cy="60" r="3.4" />
      </svg>
    </div>
  );
}
