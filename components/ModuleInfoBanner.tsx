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
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Live</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-600 sm:text-sm">{description}</p>
      </div>
    </section>
  );
}
