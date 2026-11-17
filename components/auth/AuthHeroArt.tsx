'use client';

import Image from 'next/image';
import authAiHero from '@/public/marketing/auth-ai-hero.png';

/**
 * AI-recruitment illustration for the auth pages' left column.
 *
 * This renders the project's own artwork: public/marketing/auth-ai-hero.png is the
 * AI-assistant-and-candidate-cards region of the supplied reference design, so the
 * figure, the profile cards and the globe are the original pixels rather than a
 * redrawn approximation.
 *
 * The imported dimensions are handed to next/image and .tf-hero-art keeps
 * the element at width:100% / height:auto, so the aspect ratio is preserved
 * identically on mobile, tablet and desktop — the column width (and, on short
 * desktops, a vh cap) is the only thing that changes. Sizing lives in authTheme.ts.
 *
 * Note: the source artwork has a baked-in light background rather than
 * transparency — the assistant's body is white, so keying the backdrop out would
 * destroy the figure. It blends into the light canvas; in dark mode it reads as a
 * light panel, which is why it carries a radius and a soft border there.
 */
export default function AuthHeroArt() {
  return (
    <div className="tf-hero-art" aria-hidden="true">
      <Image
        src={authAiHero}
        alt=""
        sizes="(max-width: 1023px) 82vw, min(560px, 43vh)"
      />
    </div>
  );
}
