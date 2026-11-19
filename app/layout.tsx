import type { Metadata, Viewport } from "next";
// import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ModalProvider } from "@/components/providers/ModalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ScoringProgressProvider } from "@/contexts/ScoringProgressContext";
import { BulkInviteProgressProvider } from "@/contexts/BulkInviteProgressContext";
import { Toaster } from "sonner";
import SubscriptionInactiveModal from "@/components/SubscriptionInactiveModal";
import SessionExpiredModal from "@/components/SessionExpiredModal";
import AccessRestrictedModal from "@/components/AccessRestrictedModal";
import { GlobalDialogProvider } from "@/components/providers/GlobalDialogProvider";
import TableScrollbars from "@/components/TableScrollbars";
import TableRowCap from "@/components/TableRowCap";
import DropdownViewportGuard from "@/components/DropdownViewportGuard";

// import localFont from "next/font/local";

// const inter = localFont({
//   src: "./fonts/Inter-Variable.woff2",
//   variable: "--font-inter",
//   display: "swap",
// });

import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  // Disable the automatic <link rel="preload"> for the font. With a heavy
  // hydration cost (three.js / mediapipe / radix), the font isn't consumed
  // within Chrome's post-load window, so the preload is flagged as wasted.
  // The font still loads on-demand via @font-face; `swap` shows a fallback
  // until it arrives. See: "preloaded ... but not used within a few seconds".
  preload: false,
})
export const metadata: Metadata = {
  title: "TalentFlow - Recruitment Dashboard",
  description: "AI-powered recruitment and talent management platform",
  icons: {
    icon: "/logos/favicon.png",
    shortcut: "/logos/favicon.png",
    apple: "/logos/favicon.png",
  },
};

/* `maximumScale: 1` is what stops iOS Safari zooming in when a field under
   16px is focused. It replaces the old globals.css rule that forced every
   input/select/textarea to 16px on phones — which kept iOS from zooming but
   made search boxes and dropdowns visibly bigger than the 14px text around
   them. iOS still allows pinch-zoom with this set; Android Chrome does not. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning style={{ colorScheme: 'light' }}>
      <head>
        <link rel="icon" href="/logos/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/logos/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logos/favicon.png" />
        {/* Suppress MediaPipe / WASM glog output (I0000/W0000/E0000 format).
            These are C++ developer logs baked into the binary that cannot be
            disabled via API — they route through WASM put_char to console.log/warn. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var glogRe = /^[IWE]\\d{4}\\s[\\d:.]+\\s+\\d+\\s+[\\w./]+\\.cc:\\d+\\]/;
                function filter(orig) {
                  return function() {
                    if (arguments.length > 0 && typeof arguments[0] === 'string' && glogRe.test(arguments[0])) return;
                    orig.apply(console, arguments);
                  };
                }
                console.log  = filter(console.log);
                console.warn = filter(console.warn);
                console.info = filter(console.info);
              })();
            `,
          }}
        />
        {/* The old token-recovery script copied tokens from localStorage into
            JS-readable cookies. Tokens are no longer kept there (security
            sheet #5: httpOnly session cookie + in-memory access token). */}
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          // Light by default; only users who pick "Auto" follow the OS setting.
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <ModalProvider>
              <GlobalDialogProvider>
                <ScoringProgressProvider>
                <BulkInviteProgressProvider>
                  {children}
                  <Toaster
                    position="top-right"
                    // Sonner's own default top offset (16px) sits inside the
                    // app header's own space (h-14/h-16/lg:h-[72px], static
                    // not fixed, but still occupying the viewport's top edge
                    // on initial load) — toasts rendered right after a page
                    // mounts collided with the notification bell, avatar, and
                    // plan-quota badge. 88px clears the tallest (lg) header
                    // plus a margin, on every breakpoint.
                    offset={{ top: '88px', right: '16px' }}
                    richColors
                    closeButton
                    expand={false}
                    visibleToasts={4}
                    toastOptions={{
                      classNames: {
                        toast: 'group rounded-lg border border-border shadow-lg',
                        title: 'text-sm font-semibold',
                        description: 'text-xs text-muted-foreground',
                        actionButton: 'text-xs font-medium',
                      },
                      duration: 4500,
                    }}
                  />
                  {/* Global subscription inactive modal - catches events from API interceptor */}
                  <SubscriptionInactiveModal />
                  {/* Global session-expired modal - shown on 401 from any API call.
                      Mounted at the root so it persists across loading-state transitions. */}
                  <SessionExpiredModal />
                  {/* Global access-restricted modal - shown when a logged-in user is
                      deactivated by an admin (reactive: rejected API request;
                      proactive: /auth/me reports is_active=false). Blocks the app. */}
                  <AccessRestrictedModal />
                  {/* Draws every data table's vertical scrollbar below its sticky
                      header. Renders nothing itself; finds tables by class. */}
                  <TableScrollbars />
                  {/* Sizes every data table to header + 10 rows, then scroll.
                      Renders nothing itself; finds tables by class. */}
                  <TableRowCap />
                  {/* Phones only: flips / nudges hand-rolled dropdowns that
                      would open off screen. Renders nothing itself. */}
                  <DropdownViewportGuard />
                </BulkInviteProgressProvider>
                </ScoringProgressProvider>
              </GlobalDialogProvider>
            </ModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
