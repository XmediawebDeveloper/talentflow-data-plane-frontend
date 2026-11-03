"use client";

import { useState } from "react";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { DISPLAY } from "@/components/marketing/fonts";
import { RevealGroup } from "@/components/marketing/motion";
import { SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

const FIELD =
  "block w-full rounded-xl border border-slate-900/[0.12] bg-mkt-canvas px-4 text-[15px] text-mkt-ink placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-900/25 focus:border-mkt-accent focus:bg-mkt-surface focus:outline-none focus:ring-4 focus:ring-mkt-accent/15 dark:border-white/15 dark:placeholder:text-slate-500";
const LABEL = "mb-1.5 block text-sm font-medium text-mkt-ink";

const CHANNELS = [
  {
    icon: Mail,
    title: "Email",
    lines: [
      { text: "hello@talentflow.com", href: "mailto:hello@talentflow.com" },
      { text: "support@talentflow.com", href: "mailto:support@talentflow.com" },
    ],
  },
  {
    icon: Phone,
    title: "Phone",
    lines: [{ text: "+1 (555) 123-4567", href: "tel:+15551234567" }, { text: "Mon–Fri 9am–6pm EST" }],
  },
  {
    icon: MapPin,
    title: "Office",
    lines: [{ text: "123 Tech Street, Suite 500" }, { text: "San Francisco, CA 94105" }],
  },
];

const EMPTY = { name: "", email: "", company: "", message: "" };

export default function ContactPage() {
  const [formData, setFormData] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData({ ...formData, [key]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Thank you for your message! We'll get back to you soon.");
    setFormData(EMPTY);
  };

  return (
    <MarketingPage>
      <PageHero
        lines={["Get in touch"]}
        lead="Have a question or want to learn more? We'd love to hear from you."
      />

      <section className={`${SECTION} border-t border-slate-900/[0.07] !pt-10 dark:border-white/[0.08] sm:!pt-16`}>
        <div className={`${SHELL} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-14`}>
          {/* Form */}
          <RevealGroup y={30}>
            <div
              data-reveal
              className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 shadow-[0_30px_60px_-40px_rgba(15,60,153,0.4)] dark:border-white/10 sm:p-8 lg:p-10"
            >
              <h2 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>
                Send us a message
              </h2>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4 sm:mt-7 sm:space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <div>
                    <label htmlFor="name" className={LABEL}>
                      Name
                    </label>
                    <input id="name" placeholder="Your name" value={formData.name} onChange={set("name")} required className={`${FIELD} h-11 sm:h-12`} />
                  </div>
                  <div>
                    <label htmlFor="email" className={LABEL}>
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={formData.email}
                      onChange={set("email")}
                      required
                      className={`${FIELD} h-11 sm:h-12`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="company" className={LABEL}>
                    Company <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input id="company" placeholder="Your company" value={formData.company} onChange={set("company")} className={`${FIELD} h-11 sm:h-12`} />
                </div>
                <div>
                  <label htmlFor="message" className={LABEL}>
                    Message
                  </label>
                  <textarea
                    id="message"
                    placeholder="How can we help you?"
                    rows={5}
                    value={formData.message}
                    onChange={set("message")}
                    required
                    className={`${FIELD} resize-y py-3`}
                  />
                </div>
                <button
                  type="submit"
                  className="group relative isolate inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-mkt-ink text-sm font-semibold text-mkt-canvas transition-shadow duration-300 hover:shadow-[0_12px_30px_-12px_rgba(15,60,153,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.99] sm:h-12 sm:text-[15px]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 translate-y-[101%] rounded-[inherit] bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0"
                  />
                  Send message
                  <Send className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-1" />
                </button>
              </form>
            </div>
          </RevealGroup>

          {/* Other ways to reach us */}
          <RevealGroup as="ul" stagger={0.1} className="space-y-3 sm:space-y-4 lg:pt-2">
            {CHANNELS.map(({ icon: Icon, title, lines }) => (
              <li
                key={title}
                data-reveal
                className="group flex items-start gap-4 rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 transition-[border-color,box-shadow] duration-300 hover:border-mkt-accent/30 hover:shadow-[0_20px_44px_-30px_rgba(15,60,153,0.45)] dark:border-white/10 sm:p-6"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mkt-accent-solid/[0.08] text-mkt-accent transition-[background-color,color,scale] duration-300 group-hover:scale-105 group-hover:bg-mkt-accent-solid group-hover:text-white dark:bg-white/10">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className={`${DISPLAY} text-base font-bold text-mkt-ink sm:text-lg`}>{title}</h3>
                  {lines.map((line) =>
                    "href" in line && line.href ? (
                      <a
                        key={line.text}
                        href={line.href}
                        className="mt-1 block break-words text-sm text-slate-600 underline-offset-4 transition-colors hover:text-mkt-accent hover:underline dark:text-slate-400 sm:text-[15px]"
                      >
                        {line.text}
                      </a>
                    ) : (
                      <p key={line.text} className="mt-1 text-sm text-slate-600 dark:text-slate-400 sm:text-[15px]">
                        {line.text}
                      </p>
                    )
                  )}
                </div>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
