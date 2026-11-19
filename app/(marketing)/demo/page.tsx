"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Check, CheckCircle2, Loader2 } from "lucide-react";
import { DISPLAY } from "@/components/marketing/fonts";
import { SHELL } from "@/components/marketing/layout";
import { PageTitle, PRE, RevealGroup } from "@/components/marketing/motion";
import { MarketingPage } from "@/components/marketing/PageShell";
import { isValidEmailFormat } from "@/lib/utils/email";

const FIELD =
  "block h-11 w-full rounded-xl border border-slate-900/[0.12] bg-mkt-canvas px-4 text-[15px] text-mkt-ink placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-900/25 focus:border-mkt-accent focus:bg-mkt-surface focus:outline-none focus:ring-4 focus:ring-mkt-accent/15 dark:border-white/15 dark:placeholder:text-slate-500 sm:h-12";
const FIELD_INVALID =
  "border-red-500 hover:border-red-500 focus:border-red-500 focus:ring-red-500/15 dark:border-red-400 dark:hover:border-red-400 dark:focus:border-red-400";
const FIELD_ERROR = "mt-1.5 text-[13px] text-red-600 dark:text-red-400";
const LABEL = "mb-1.5 block text-sm font-medium text-mkt-ink";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const POINTS = [
  "Meet Bina, our AI interviewer, and see a sample interview report",
  "See proctored AI Assessments, coding round included",
  "See Resume Scoring with a written reason for every score",
  "Watch AI Talent Match rank your best-fit resumes in seconds",
];

type FormData = { name: string; email: string; company: string; phone: string };
type FieldErrors = Partial<Record<keyof FormData, string>>;

function validateEmail(value: string): string | undefined {
  const v = value.trim();
  if (!v) return "Enter your email address.";
  // Format: one @, no spaces or stray dots, a real domain ending; also catches
  // misspelt providers such as "gmail.om" or "gmial.com".
  if (v.length > 254 || !isValidEmailFormat(v)) return "Enter a valid email address, like john@company.com.";
  return undefined;
}

const PHONE_MAX_DIGITS = 10;

// Phone is optional and numbers only (the input drops anything else). The only
// rule left to check: no more than 10 digits. A leading +91 country code is not
// counted, so "+919876543210" is fine.
function validatePhone(value: string): string | undefined {
  const digits = value.trim().replace(/^\+91/, "").replace(/\D/g, "");
  if (digits.length > PHONE_MAX_DIGITS) return `Phone number cannot be more than ${PHONE_MAX_DIGITS} digits.`;
  return undefined;
}

// Email is validated; phone only for its length. Full name and company just
// have to be filled in (the API requires them).
function validateForm(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.name.trim()) errors.name = "Enter your full name.";
  const email = validateEmail(data.email);
  if (email) errors.email = email;
  if (!data.company.trim()) errors.company = "Enter your company name.";
  const phone = validatePhone(data.phone);
  if (phone) errors.phone = phone;
  return errors;
}

export default function DemoPage() {
  const [formData, setFormData] = useState<FormData>({ name: "", email: "", company: "", phone: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    // Phone accepts numbers only: letters, spaces and symbols are dropped as they
    // are typed or pasted. The one exception is a "+" at the very start (for +91).
    const value =
      key === "phone" ? e.target.value.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "") : e.target.value;
    const next = { ...formData, [key]: value };
    setFormData(next);
    // Once a field shows an error, re-check it as the visitor types so it clears when fixed
    // Phone is checked on every keystroke, so the "more than 10 digits" error shows at once
    if (fieldErrors[key] || key === "phone") setFieldErrors({ ...fieldErrors, [key]: validateForm(next)[key] });
  };
  // Email: show the red error under the field shortly after the visitor stops
  // typing an invalid address (not on every keystroke, which would flash an
  // error while a correct address is still being typed). It is also checked on
  // leaving the field and on submit.
  const emailValue = formData.email;
  useEffect(() => {
    if (!emailValue.trim()) return;
    const id = window.setTimeout(() => {
      setFieldErrors((prev) => ({ ...prev, email: validateEmail(emailValue) }));
    }, 600);
    return () => window.clearTimeout(id);
  }, [emailValue]);

  // Check a field when the visitor leaves it
  const checkField = (key: keyof FormData) => () =>
    setFieldErrors((prev) => ({ ...prev, [key]: validateForm(formData)[key] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errors = validateForm(formData);
    setFieldErrors(errors);
    const firstInvalid = (["name", "email", "company", "phone"] as const).find((k) => errors[k]);
    if (firstInvalid) {
      setError(null);
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.name.trim(),
          email: formData.email.trim(),
          company: formData.company.trim(),
          phone: formData.phone.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = typeof body?.detail === "string" ? body.detail : null;
        throw new Error(
          res.status === 429
            ? "Too many requests. Please try again later."
            : res.status === 422
              ? detail || "Please check the details you entered."
              : detail || "We couldn't submit your request. Please try again.",
        );
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingPage>
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.14),transparent)] dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.18),transparent)]"
        />
        <div
          className={`${SHELL} relative grid grid-cols-1 items-center gap-10 pb-12 pt-9 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28`}
        >
          {/* Pitch */}
          <div>
            <PageTitle
              lines={["See TalentFlow", "in action"]}
              className={`${DISPLAY} text-[clamp(2rem,6vw,4.5rem)] font-extrabold leading-[1] tracking-[-0.045em] text-mkt-ink`}
            />
            <RevealGroup immediate delay={0.5} stagger={0.1}>
              <p
                data-reveal
                data-pre
                className={`${PRE} mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-6 sm:text-xl`}
              >
                See how TalentFlow takes you from job description to final interview on one
                platform, with AI at every step.
              </p>
              <ul className="mt-6 space-y-3 sm:mt-9 sm:space-y-4">
                {POINTS.map((point) => (
                  <li key={point} data-reveal data-pre className={`${PRE} flex items-start gap-3`}>
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mkt-cyan/15 text-mkt-cyan-ink">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] text-slate-700 dark:text-slate-300 sm:text-base">{point}</span>
                  </li>
                ))}
              </ul>
            </RevealGroup>
          </div>

          {/* Booking form */}
          <RevealGroup immediate delay={0.35} y={40}>
            <div
              data-reveal
              data-pre
              className={`${PRE} rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 shadow-[0_40px_80px_-48px_rgba(15,60,153,0.5)] dark:border-white/10 sm:p-8 lg:p-10`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-mkt-accent-solid text-white">
                  <Calendar className="h-5 w-5" />
                </span>
                <h2 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>
                  Book your demo
                </h2>
              </div>

              {submitted ? (
                <div role="status" className="mt-6 flex flex-col items-center gap-3 py-6 text-center sm:mt-8">
                  <CheckCircle2 className="h-12 w-12 text-mkt-cyan-ink" />
                  <h3 className={`${DISPLAY} text-lg font-bold text-mkt-ink sm:text-xl`}>Request received</h3>
                  <p className="max-w-sm text-[15px] text-slate-600 dark:text-slate-300">
                    Thanks, {formData.name.trim().split(/\s+/)[0].replace(/^\p{L}/u, (c) => c.toUpperCase()) || "there"}! Our team will reach out at{" "}
                    <span className="font-medium text-mkt-ink">{formData.email.trim()}</span> to schedule your demo.
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Can&apos;t wait? Start your{" "}
                    <Link href="/signup" className="font-semibold text-mkt-accent underline-offset-4 hover:underline">
                      free trial
                    </Link>{" "}
                    now
                  </p>
                </div>
              ) : (
              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
                <div>
                  <label htmlFor="name" className={LABEL}>
                    Full name
                  </label>
                  <input
                    id="name"
                    placeholder="John Doe"
                    autoComplete="name"
                    maxLength={255}
                    value={formData.name}
                    onChange={set("name")}
                    onBlur={checkField("name")}
                    required
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={fieldErrors.name ? "name-error" : undefined}
                    className={`${FIELD} ${fieldErrors.name ? FIELD_INVALID : ""}`}
                  />
                  {fieldErrors.name && <p id="name-error" role="alert" className={FIELD_ERROR}>{fieldErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="email" className={LABEL}>
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="john@company.com"
                    maxLength={254}
                    value={formData.email}
                    onChange={set("email")}
                    onBlur={checkField("email")}
                    required
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    className={`${FIELD} ${fieldErrors.email ? FIELD_INVALID : ""}`}
                  />
                  {fieldErrors.email && <p id="email-error" role="alert" className={FIELD_ERROR}>{fieldErrors.email}</p>}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <div>
                    <label htmlFor="company" className={LABEL}>
                      Company
                    </label>
                    <input
                      id="company"
                      placeholder="Your company"
                      autoComplete="organization"
                      maxLength={255}
                      value={formData.company}
                      onChange={set("company")}
                      onBlur={checkField("company")}
                      required
                      aria-invalid={!!fieldErrors.company}
                      aria-describedby={fieldErrors.company ? "company-error" : undefined}
                      className={`${FIELD} ${fieldErrors.company ? FIELD_INVALID : ""}`}
                    />
                    {fieldErrors.company && <p id="company-error" role="alert" className={FIELD_ERROR}>{fieldErrors.company}</p>}
                  </div>
                  <div>
                    <label htmlFor="phone" className={LABEL}>
                      Phone <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+91"
                      maxLength={50}
                      value={formData.phone}
                      onChange={set("phone")}
                      onBlur={checkField("phone")}
                      aria-invalid={!!fieldErrors.phone}
                      aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                      className={`${FIELD} ${fieldErrors.phone ? FIELD_INVALID : ""}`}
                    />
                    {fieldErrors.phone && <p id="phone-error" role="alert" className={FIELD_ERROR}>{fieldErrors.phone}</p>}
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting}
                  className="group disabled:cursor-not-allowed disabled:opacity-70 relative isolate inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-mkt-ink text-sm font-semibold text-mkt-canvas transition-shadow duration-300 hover:shadow-[0_12px_30px_-12px_rgba(15,60,153,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.99] sm:h-12 sm:text-[15px]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 translate-y-[101%] rounded-[inherit] bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0"
                  />
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      Request demo
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                  Or start your{" "}
                  <Link href="/signup" className="font-semibold text-mkt-accent underline-offset-4 hover:underline">
                    free trial
                  </Link>{" "}
                  now
                </p>
              </form>
              )}
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
