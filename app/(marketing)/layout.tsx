import type { Metadata } from "next";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: {
    default:
      "TalentFlow | AI Hiring Platform: JD Creation, Resume Scoring, AI Assessments & AI Interviews",
    template: "%s | TalentFlow",
  },
  description:
    "Hire faster with TalentFlow. AI writes job descriptions, ranks and scores resumes, runs proctored coding and skill tests, and conducts voice interviews, all in one platform.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
