import { Cta } from "@/components/marketing/Cta";
import { DISPLAY } from "@/components/marketing/fonts";
import { FaqCategories } from "@/components/marketing/faq/FaqCategories";
import { FaqHeroStage } from "@/components/marketing/faq/FaqHeroStage";
import { SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

export default function FAQPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["Frequently asked", "questions"]}
        lead="Straight answers on how TalentFlow works, from job description to AI interview, and how plans and units are counted."
        aside={<FaqHeroStage />}
      />

      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <FaqCategories />
        </div>
      </section>

      {/* Contact path */}
      <section className="border-t border-slate-900/[0.07] bg-mkt-surface py-12 dark:border-white/[0.08] sm:py-20">
        <div className={`${SHELL} flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8`}>
          <div>
            <h2 className={`${DISPLAY} text-[clamp(1.4rem,3.4vw,2.25rem)] font-bold leading-tight tracking-[-0.03em] text-mkt-ink`}>
              Still have questions?
            </h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
              Ask our team directly, or see TalentFlow in action first.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:gap-3">
            <Cta href="/contact" arrow="upRight">
              Contact us
            </Cta>
            <Cta href="/how-it-works" variant="secondary">
              See How It Works
            </Cta>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
