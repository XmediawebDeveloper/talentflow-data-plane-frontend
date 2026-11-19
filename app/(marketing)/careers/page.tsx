import type { Metadata } from "next";
import { Cta } from "@/components/marketing/Cta";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

/*
 * No real openings to list, so this is an empty state (website content v2,
 * Section 15: no hardcoded jobs). Kept out of search results until real roles exist.
 */
export const metadata: Metadata = {
  title: "Careers",
  robots: { index: false },
};

export default function CareersPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["No open roles", "listed right now"]}
        lead="We don’t have any roles to list at the moment. If you’d like to introduce yourself, we’d be glad to hear from you."
        actions={
          <Cta href="/contact" arrow="upRight">
            Get in touch
          </Cta>
        }
      />
    </MarketingPage>
  );
}
