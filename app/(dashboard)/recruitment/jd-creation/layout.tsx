import { MobileRecordCardVariantProvider } from '@/components/ui/mobile-record-card';

/* Job Openings module: every phone / tablet record card on these pages (and
   the popups they open) uses the Job Openings card layout — see
   MobileRecordCardVariant in components/ui/mobile-record-card.tsx. */
export default function JobOpeningsModuleLayout({ children }: { children: React.ReactNode }) {
  return <MobileRecordCardVariantProvider variant="jd">{children}</MobileRecordCardVariantProvider>;
}
