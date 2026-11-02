import { ArrowLink } from "@/components/marketing/Cta";
import { DISPLAY } from "@/components/marketing/fonts";
import { CountUp, RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { H2, SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

const STATS = [
  { label: "Customers", value: "2,500+" },
  { label: "Countries", value: "50+" },
  { label: "Resumes processed", value: "5M+" },
  { label: "Team members", value: "100+" },
];

export default function AboutPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["We're on a mission", "to transform hiring"]}
        lead="TalentFlow was founded in 2020 with a simple goal: make hiring smarter, faster, and more human."
      />

      {/* Proof line — numbers count up as it comes into view. */}
      <div className="border-y border-slate-900/[0.07] dark:border-white/[0.08]">
        <dl className={`${SHELL} grid grid-cols-2 md:grid-cols-4`}>
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`border-slate-900/[0.07] py-4 dark:border-white/[0.08] sm:py-8 ${
                i % 2 === 1 ? "border-l pl-5 sm:pl-8" : ""
              } ${i < 2 ? "border-b md:border-b-0" : ""} ${i === 2 ? "md:border-l md:pl-8" : ""}`}
            >
              <dt className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{stat.label}</dt>
              <dd className={`${DISPLAY} mt-0.5 text-2xl font-bold tracking-[-0.03em] text-mkt-ink sm:text-4xl`}>
                <CountUp value={stat.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Story */}
      <section className={SECTION}>
        <div className={`${SHELL} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <RevealHeading text="Our story" className={H2} />
          </div>
          <RevealGroup className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:space-y-5 sm:text-lg">
            <p data-reveal>
              TalentFlow started when our founders experienced firsthand the challenges of modern
              recruitment. As hiring managers at growing tech companies, they spent countless hours
              sifting through resumes, coordinating interviews, and managing candidate pipelines.
            </p>
            <p data-reveal>
              They knew there had to be a better way. So they built TalentFlow &mdash; an
              AI-powered platform that automates the tedious parts of recruiting while keeping the
              human element at its core.
            </p>
            <p data-reveal>
              Today, TalentFlow helps thousands of companies around the world find and hire the best
              talent. Our platform processes millions of resumes annually and has helped place
              candidates in roles at companies ranging from startups to Fortune 500 enterprises.
            </p>
            <div data-reveal className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
              <ArrowLink href="/careers">See open roles</ArrowLink>
              <ArrowLink href="/contact">Contact us</ArrowLink>
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
