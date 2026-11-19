import type { Metadata } from "next";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";
import { AboutHeroStage } from "@/components/marketing/about/AboutHeroStage";
import {
  AboutAudiences,
  AboutCta,
  AboutValues,
  AboutWhy,
} from "@/components/marketing/about/AboutSections";

export const metadata: Metadata = {
  title: "About",
  description:
    "TalentFlow takes you from job description to final interview on one AI hiring platform, for any industry and any role.",
};

export default function AboutPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["From JD to hire,", "all with AI."]}
        lead="TalentFlow puts your whole hiring process on one platform. AI writes your JD, finds the best resumes, scores them, tests skills and interviews candidates, so your team only meets the best."
        aside={<AboutHeroStage />}
      />
      <AboutWhy />
      <AboutAudiences />
      <AboutValues />
      <AboutCta />
    </MarketingPage>
  );
}
