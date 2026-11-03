import type { ReactNode } from 'react';

interface ModuleInfoBannerProps {
  icon: ReactNode;
  title: string;
  description: string;
}

/** Consistent overview banner used at the top of AI-enabled recruitment modules. */
export default function ModuleInfoBanner({ icon, title, description }: ModuleInfoBannerProps) {
  return (
    <section className="mb-5 flex items-start gap-3 rounded-xl border border-brand-blue/20 bg-gradient-to-r from-brand-blue/[0.05] to-brand-cyan/[0.03] p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-brand-blue/5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="tf-row-title">{title}</h2>
          <span className="tf-badge bg-emerald-100 text-2xs uppercase tracking-wide text-emerald-700">Live</span>
        </div>
        <p className="mt-1 tf-meta leading-5 sm:text-sm">{description}</p>
      </div>
    </section>
  );
}
