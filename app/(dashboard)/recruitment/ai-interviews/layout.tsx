import { MobileRecordCardVariantProvider } from '@/components/ui/mobile-record-card';

/* AI Interviews module: phone / tablet record cards, tab toolbars, dropdown
   menus and selects on these pages (and the popups they open) use the Job
   Openings module's layout — see MobileRecordCardVariant in
   components/ui/mobile-record-card.tsx. */
export default function AIInterviewsModuleLayout({ children }: { children: React.ReactNode }) {
  return <MobileRecordCardVariantProvider variant="jd">{children}</MobileRecordCardVariantProvider>;
}
