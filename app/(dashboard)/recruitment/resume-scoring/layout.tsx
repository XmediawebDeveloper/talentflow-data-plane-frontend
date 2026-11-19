import { MobileRecordCardVariantProvider } from '@/components/ui/mobile-record-card';

/* Resume Scoring module: phone / tablet record cards, tab toolbars, dropdown
   menus and selects on these pages (and the popups they open) use the Job
   Openings module's layout — see MobileRecordCardVariant in
   components/ui/mobile-record-card.tsx. */
export default function ResumeScoringModuleLayout({ children }: { children: React.ReactNode }) {
  return <MobileRecordCardVariantProvider variant="jd">{children}</MobileRecordCardVariantProvider>;
}
