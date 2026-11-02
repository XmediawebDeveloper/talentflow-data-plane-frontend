import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

const FAQS = [
  {
    q: "What is TalentFlow?",
    a: "TalentFlow is an AI-powered recruitment platform that helps companies streamline their hiring process. From resume parsing to candidate scoring, assessments, and video interviews - we provide all the tools you need to find and hire the best talent faster.",
  },
  {
    q: "How does the AI resume scoring work?",
    a: "Our AI analyzes resumes against your job requirements, considering skills, experience, education, and other factors. It provides a match score for each candidate, helping you quickly identify the most qualified applicants.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! We offer a 14-day free trial with full access to all features. No credit card required to start.",
  },
  {
    q: "Can I integrate TalentFlow with my existing ATS?",
    a: "Absolutely. TalentFlow integrates with popular ATS systems including Greenhouse, Lever, Workday, and many others. We also provide a robust API for custom integrations.",
  },
  {
    q: "How secure is my data?",
    a: "Security is our top priority. We're SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest and in transit using bank-level encryption.",
  },
  {
    q: "What support options are available?",
    a: "All plans include email support. Business and Enterprise plans include priority support with faster response times. Enterprise customers also get a dedicated success manager.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees.",
  },
  {
    q: "Do you offer team collaboration features?",
    a: "Yes! TalentFlow includes robust collaboration tools that allow your team to share feedback, coordinate interviews, and make hiring decisions together.",
  },
];

export default function FAQPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["Frequently asked", "questions"]}
        lead="Everything you need to know about TalentFlow."
      />
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <MarketingFaq
            items={FAQS}
            title="Still have questions?"
            lead="Our team is here to help. Get in touch and we’ll get back to you within 24 hours."
          />
        </div>
      </section>
    </MarketingPage>
  );
}
