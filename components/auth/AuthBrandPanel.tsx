'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { ShieldCheck, Globe2 } from 'lucide-react';
import AuthHeroArt from './AuthHeroArt';

/**
 * The shared left-hand column for every auth screen (Login, Signup, ...).
 *
 * Login and Signup previously built their own asides — different lockups, one with
 * an image and one with an icon brandmark, different supporting content — which is
 * why they read as two products. Both now render this, so the branding, the
 * illustration and the trust strip stay in lockstep; only the headline and lede
 * differ per screen.
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

      <div className="tf-login-proof-row" aria-label="Trust and security highlights">
        <div className="tf-login-proof">
          <div className="tf-login-proof-icon tf-login-proof-icon--teal">
            <ShieldCheck style={{ width: 20, height: 20 }} />
          </div>
          <div>
            <div className="tf-login-proof-title">Trusted by 1000+ Companies</div>
            <div className="tf-login-proof-copy">Across 20+ countries</div>
          </div>
        </div>
        <div className="tf-login-proof">
          <div className="tf-login-proof-icon tf-login-proof-icon--blue">
            <Globe2 style={{ width: 20, height: 20 }} />
          </div>
          <div>
            <div className="tf-login-proof-title">Enterprise Grade Security</div>
            <div className="tf-login-proof-copy">ISO 27001 compliant</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
