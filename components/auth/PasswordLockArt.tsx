'use client';

/**
 * Faded padlock that sits in the bottom-right of the password-requirements
 * panel. Purely decorative: it is positioned absolutely behind the checklist
 * and takes no pointer events, so it never competes with the rows for space.
 *
 * Fills come from .tf-pw-art in authTheme.ts rather than literals, so the
 * artwork tracks the theme like the dialog's other illustrations.
 */
export default function PasswordLockArt() {
  return (
    <div className="tf-pw-art" aria-hidden="true">
      <svg viewBox="0 0 150 130" role="presentation" focusable="false">
        {/* Soft cloud behind the lock */}
        <circle className="pw-cloud" cx="74" cy="74" r="46" />
        <circle className="pw-cloud" cx="38" cy="92" r="24" />

        {/* Padlock */}
        <path className="pw-shackle" d="M55 60V44a20 20 0 0 1 40 0v16" />
        <rect className="pw-lock" x="40" y="58" width="70" height="60" rx="11" />
        <circle className="pw-lock-hole" cx="75" cy="82" r="7.5" />
        <rect className="pw-lock-hole" x="71.5" y="86" width="7" height="16" rx="3.5" />

        {/* Verified badge */}
        <circle className="pw-badge" cx="118" cy="102" r="18" />
        <path className="pw-badge-tick" d="M110.5 102.5l4.8 4.8 9-9.4" />

        {/* Sparkles */}
        <path className="pw-spark" d="M126 44l1.5 3.8 3.8 1.5-3.8 1.5-1.5 3.8-1.5-3.8-3.8-1.5 3.8-1.5z" />
        <circle className="pw-spark" cx="30" cy="52" r="3" />
        <circle className="pw-spark" cx="108" cy="30" r="2.2" />
      </svg>
    </div>
  );
}
