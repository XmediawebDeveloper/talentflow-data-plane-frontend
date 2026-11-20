"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  CircleHelp,
  Copy,
  CreditCard,
  LifeBuoy,
  Mail,
  MessageSquareText,
  Presentation,
  Send,
  User,
  type LucideIcon,
} from "lucide-react";
import { ArrowLink, Cta } from "@/components/marketing/Cta";
import { ContactHeroStage } from "@/components/marketing/contact/ContactHeroStage";
import { DISPLAY } from "@/components/marketing/fonts";
import { RevealGroup } from "@/components/marketing/motion";
import { SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

/* ------------------------------------------------------------------ */

const TOPICS: Array<{ id: string; label: string; icon: LucideIcon; hint: string }> = [
  { id: "pricing", label: "Plans & pricing", icon: CreditCard, hint: "Tell us your team size and how many roles you hire for." },
  { id: "demo", label: "Book a demo", icon: Presentation, hint: "Which modules would you like to see? AI Interviews, Assessments, Scoring…" },
  { id: "product", label: "Product question", icon: CircleHelp, hint: "What would you like to know about TalentFlow?" },
  { id: "support", label: "Support", icon: LifeBuoy, hint: "Describe the issue and the page you saw it on." },
];

const EMAILS = [
  { label: "Sales", address: "hello@talentflow.com" },
  { label: "Support", address: "support@talentflow.com" },
];

const MAX_MESSAGE = 1000;
const EMPTY = { name: "", email: "", company: "", message: "" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */

/** Input with a leading icon, focus glow and an optional valid tick. */
function Field({
  id,
  label,
  icon: Icon,
  optional,
  valid,
  error,
  ...input
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  optional?: boolean;
  valid?: boolean;
  error?: string | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-sm font-semibold text-mkt-ink">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">Optional</span>}
      </label>
      <div className="group/field relative">
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within/field:text-mkt-accent"
        />
        <input
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`block h-12 w-full rounded-2xl border bg-mkt-canvas pl-11 pr-11 text-[15px] text-mkt-ink placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-900/25 focus:bg-mkt-surface focus:outline-none focus:ring-4 dark:placeholder:text-slate-500 ${
            error
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
              : "border-slate-900/[0.12] focus:border-mkt-accent focus:ring-mkt-accent/15 dark:border-white/15"
          }`}
          {...input}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-emerald-500 text-white transition-[scale,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            valid ? "scale-100 opacity-100" : "scale-0 opacity-0"
          }`}
        >
          <Check className="h-3 w-3" strokeWidth={3.5} />
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

function CopyEmail({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${address}`;
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-900/[0.07] bg-mkt-canvas px-4 py-3 dark:border-white/10">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <a
          href={`mailto:${address}`}
          className="block truncate text-[15px] font-semibold text-mkt-ink underline-offset-4 hover:text-mkt-accent hover:underline"
        >
          {address}
        </a>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${address} copied` : `Copy ${address}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-900/10 text-slate-500 transition-[color,border-color,background-color,scale] duration-200 hover:border-mkt-accent/40 hover:text-mkt-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:border-white/15"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ContactPage() {
  const [formData, setFormData] = useState(EMPTY);
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [emailTouched, setEmailTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData({ ...formData, [key]: e.target.value });

  const emailValid = EMAIL_RE.test(formData.email);
  const emailError = emailTouched && formData.email && !emailValid ? "Enter a valid email address." : null;
  const activeTopic = TOPICS.find((t) => t.id === topic) ?? TOPICS[0];

  // Glide down to the form (instant for reduced motion), then put the
  // cursor in the first field without jumping the page again.
  const scrollToForm = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("contact-form")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("name")?.focus({ preventScroll: true }), reduce ? 0 : 700);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) {
      setEmailTouched(true);
      return;
    }
    setSentTo(formData.name.trim().split(" ")[0] || "there");
    setFormData(EMPTY);
    setEmailTouched(false);
  };

  return (
    <MarketingPage>
      <PageHero
        lines={["Get in touch"]}
        lead="Questions about TalentFlow, or want a plan sized to your team? Talk to Sales, or send us a message below."
        aside={<ContactHeroStage />}
        actions={
          <>
            <Cta href="/demo" magnetic>
              Book a Demo
            </Cta>
            <Cta variant="secondary" arrow={null} icon={MessageSquareText} onClick={scrollToForm}>
              Send a message
            </Cta>
          </>
        }
      />

      <section
        id="contact-form"
        className={`${SECTION} scroll-mt-20 border-t border-slate-900/[0.07] !pt-10 dark:border-white/[0.08] sm:!pt-16`}
      >
        <div className={`${SHELL} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-12`}>
          {/* Form card */}
          <RevealGroup y={30}>
            <div
              data-reveal
              // Phones: no card frame — the form sits on the page at full width.
              className="relative overflow-hidden rounded-[24px] border border-slate-900/[0.08] bg-mkt-surface p-5 shadow-[0_40px_80px_-50px_rgba(15,60,153,0.45)] dark:border-white/10 max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-8 lg:p-10"
            >
              {/* brand hairline + corner glow (part of the card, so not on phones) */}
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-mkt-accent-solid via-mkt-accent to-mkt-cyan max-sm:hidden" />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p14),transparent)] max-sm:hidden"
              />

              {sentTo ? (
                /* Success state */
                <div className="relative flex min-h-[460px] flex-col items-center justify-center text-center" role="status">
                  <span className="relative grid h-20 w-20 place-items-center">
                    <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20 motion-reduce:animate-none" />
                    <span className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_18px_40px_-14px_rgba(16,185,129,0.7)] animate-in zoom-in-50 duration-500">
                      <Check className="h-9 w-9" strokeWidth={3} />
                    </span>
                  </span>
                  <h2 className={`${DISPLAY} mt-6 text-2xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-3xl animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                    Thanks, {sentTo}. Your message is in.
                  </h2>
                  <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 animate-in fade-in slide-in-from-bottom-2 duration-700">
                    Our team will get back to you by email. Meanwhile, you can see TalentFlow in action.
                  </p>
                  <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                    <Cta href="/demo" size="sm">Book a Demo</Cta>
                    <button
                      type="button"
                      onClick={() => setSentTo(null)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-slate-900/15 px-5 text-sm font-semibold text-mkt-ink transition-colors hover:border-slate-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:border-white/15"
                    >
                      Send another message
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <h2 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>
                    Send us a message
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 sm:text-[15px]">
                    Pick a topic and tell us a little about your team.
                  </p>

                  <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5 sm:mt-8">
                    {/* Topic */}
                    <fieldset>
                      <legend className="mb-2 text-sm font-semibold text-mkt-ink">What can we help with?</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {TOPICS.map(({ id, label, icon: Icon }) => {
                          const on = topic === id;
                          return (
                            <label
                              key={id}
                              className={`group relative flex cursor-pointer flex-col items-start gap-2 rounded-2xl border p-3 text-[13px] font-semibold transition-[border-color,background-color,box-shadow,translate] duration-300 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mkt-accent-solid sm:p-3.5 ${
                                on
                                  ? "-translate-y-0.5 border-mkt-accent/50 bg-mkt-accent-solid/[0.06] text-mkt-ink shadow-[0_14px_30px_-20px_rgba(15,60,153,0.6)]"
                                  : "border-slate-900/[0.1] text-slate-600 hover:border-slate-900/25 hover:text-mkt-ink dark:border-white/10 dark:text-slate-300"
                              }`}
                            >
                              <input
                                type="radio"
                                name="topic"
                                value={id}
                                checked={on}
                                onChange={() => setTopic(id)}
                                className="sr-only"
                              />
                              <span
                                className={`grid h-8 w-8 place-items-center rounded-xl transition-[background-color,color,rotate,scale] duration-300 ${
                                  on
                                    ? "rotate-[-6deg] scale-110 bg-mkt-accent-solid text-white"
                                    : "bg-slate-900/[0.05] text-slate-500 group-hover:text-mkt-accent dark:bg-white/10"
                                }`}
                              >
                                <Icon aria-hidden="true" className="h-4 w-4" />
                              </span>
                              {label}
                              <span
                                aria-hidden="true"
                                className={`absolute right-2.5 top-2.5 grid h-4 w-4 place-items-center rounded-full bg-mkt-accent-solid text-white transition-[scale,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                                  on ? "scale-100 opacity-100" : "scale-0 opacity-0"
                                }`}
                              >
                                <Check className="h-2.5 w-2.5" strokeWidth={4} />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field
                        id="name"
                        label="Name"
                        icon={User}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                        value={formData.name}
                        onChange={set("name")}
                        valid={formData.name.trim().length > 1}
                      />
                      <Field
                        id="email"
                        label="Work email"
                        icon={Mail}
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        required
                        value={formData.email}
                        onChange={set("email")}
                        onBlur={() => setEmailTouched(true)}
                        valid={emailValid}
                        error={emailError}
                      />
                    </div>

                    <Field
                      id="company"
                      label="Company"
                      icon={Building2}
                      optional
                      placeholder="Your company"
                      autoComplete="organization"
                      value={formData.company}
                      onChange={set("company")}
                      valid={formData.company.trim().length > 1}
                    />

                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <label htmlFor="message" className="text-sm font-semibold text-mkt-ink">
                          Message
                        </label>
                        <span
                          aria-live="polite"
                          className={`text-xs tabular-nums ${
                            formData.message.length > MAX_MESSAGE * 0.9 ? "text-amber-600" : "text-slate-400"
                          }`}
                        >
                          {formData.message.length}/{MAX_MESSAGE}
                        </span>
                      </div>
                      <div className="group/field relative">
                        <MessageSquareText
                          aria-hidden="true"
                          className="pointer-events-none absolute left-4 top-3.5 h-[18px] w-[18px] text-slate-400 transition-colors duration-200 group-focus-within/field:text-mkt-accent"
                        />
                        <textarea
                          id="message"
                          rows={5}
                          maxLength={MAX_MESSAGE}
                          required
                          placeholder={activeTopic.hint}
                          value={formData.message}
                          onChange={set("message")}
                          className="block w-full resize-y rounded-2xl border border-slate-900/[0.12] bg-mkt-canvas py-3 pl-11 pr-4 text-[15px] leading-relaxed text-mkt-ink placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-900/25 focus:border-mkt-accent focus:bg-mkt-surface focus:outline-none focus:ring-4 focus:ring-mkt-accent/15 dark:border-white/15 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        We&apos;ll only use your details to reply to you.
                      </p>
                      <button
                        type="submit"
                        disabled={!formData.name.trim() || !formData.message.trim() || !formData.email}
                        className="group relative isolate inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-mkt-ink px-7 text-[15px] font-semibold text-mkt-canvas transition-[box-shadow,opacity] duration-300 hover:shadow-[0_14px_32px_-12px_rgba(15,60,153,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 -z-10 translate-y-[101%] rounded-[inherit] bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-enabled:group-hover:translate-y-0"
                        />
                        Send message
                        <Send className="h-4 w-4 transition-transform duration-300 ease-out group-enabled:group-hover:-translate-y-0.5 group-enabled:group-hover:translate-x-1" />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </RevealGroup>

          {/* Other ways to reach us */}
          <RevealGroup stagger={0.1} className="space-y-4 lg:pt-2">
            <div
              data-reveal
              className="rounded-[24px] border border-slate-900/[0.08] bg-mkt-surface p-5 dark:border-white/10 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-mkt-accent-solid/[0.08] text-mkt-accent dark:bg-white/10">
                  <Mail aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className={`${DISPLAY} text-lg font-bold text-mkt-ink`}>Email us</h3>
              </div>
              <div className="mt-4 space-y-2.5">
                {EMAILS.map((e) => (
                  <CopyEmail key={e.address} {...e} />
                ))}
              </div>
            </div>

            <div
              data-reveal
              className="rounded-[24px] border border-dashed border-slate-900/[0.14] p-5 dark:border-white/15 sm:p-6"
            >
              <h3 className={`${DISPLAY} text-base font-bold text-mkt-ink`}>Prefer to explore first?</h3>
              <div className="mt-3 flex flex-col gap-2.5">
                <ArrowLink href="/faq">Read the FAQ</ArrowLink>
                <ArrowLink href="/pricing">See pricing</ArrowLink>
                <ArrowLink href="/how-it-works">See how it works</ArrowLink>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
