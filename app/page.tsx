import type { Metadata } from "next";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LandingPageContent } from "@/components/marketing/LandingPageContent";

const TITLE = "TalentFlow | AI Hiring Platform: JD Creation, Resume Scoring, AI Assessments & AI Interviews";
const DESCRIPTION =
  "Hire faster with TalentFlow. AI writes job descriptions, ranks and scores resumes, runs proctored coding and skill tests, and conducts voice interviews, all in one platform.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <LandingPageContent />
      </main>
      <Footer />
    </>
  );
}
