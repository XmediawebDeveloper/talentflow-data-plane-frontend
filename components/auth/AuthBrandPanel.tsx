'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import AuthHeroArt from './AuthHeroArt';

/**
 * The shared left-hand column for every auth screen (Login, Signup, ...).
 *
 * Login and Signup previously built their own asides — different lockups, one with
 * an image and one with an icon brandmark, different supporting content — which is
 * why they read as two products. Both now render this, so the branding and the
 * illustration stay in lockstep; only the headline and lede differ per screen.
 */

interface AuthBrandPanelProps {
  /** Small line above the headline (e.g. a positioning statement). */
  eyebrow?: ReactNode;
  /** Screen-specific headline. Wrap the gradient part in <span className="tf-accent">. */
  headline: ReactNode;
  /** Screen-specific supporting copy. */
  lede: ReactNode;
  /** When provided, the logo becomes a button back to the public site. */
  onBackToPublic?: () => void;
  /** Accessible label for the column. */
  label?: string;
}

export default function AuthBrandPanel({
  eyebrow,
  headline,
  lede,
  onBackToPublic,
  label = 'TalentFlow overview',
}: AuthBrandPanelProps) {
  const brandLogo = (
    <Image
      src="/logos/talent_flow_logo.png"
      alt="BION TalentFlow"
      width={314}
      height={70}
      className="tf-auth-logo"
    />
  );

  return (
    <aside className="tf-auth-aside" aria-label={label}>
      <div className="tf-auth-lockup">
        {onBackToPublic ? (
          <button
            type="button"
            onClick={onBackToPublic}
            className="tf-auth-logo-link"
            aria-label="Back to home"
          >
            {brandLogo}
          </button>
        ) : (
          brandLogo
        )}
      </div>

      {eyebrow ? <p className="tf-auth-eyebrow">{eyebrow}</p> : null}

      <h1 className="tf-auth-headline">{headline}</h1>

      <p className="tf-auth-lede">{lede}</p>

      <AuthHeroArt />
    </aside>
  );
}
