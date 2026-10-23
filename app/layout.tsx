import type { Metadata } from "next";
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
        {/* Token recovery script - runs before any navigation to restore cookies from localStorage */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Get tokens from localStorage
                  var accessToken = localStorage.getItem('accessToken');
                  var refreshToken = localStorage.getItem('refreshToken');

                  // Check if cookies exist
                  function getCookie(name) {
                    var value = '; ' + document.cookie;
                    var parts = value.split('; ' + name + '=');
                    if (parts.length === 2) return parts.pop().split(';').shift();
                  }

                  var accessCookie = getCookie('accessToken');

                  // If localStorage has token but cookie doesn't, restore cookie
                  if (accessToken && !accessCookie) {
                    console.log('[TOKEN RECOVERY] Restoring cookies from localStorage');

                    var isSecure = window.location.protocol === 'https:';
                    var cookieOptions = 'path=/; sameSite=lax' + (isSecure ? '; secure' : '');

                    // Set cookies with expiry
                    var accessExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
                    document.cookie = 'accessToken=' + accessToken + '; expires=' + accessExpiry + '; ' + cookieOptions;

                    if (refreshToken) {
                      var refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
                      document.cookie = 'refreshToken=' + refreshToken + '; expires=' + refreshExpiry + '; ' + cookieOptions;
                    }

                    console.log('[TOKEN RECOVERY] Cookies restored successfully');
                  }
                } catch (e) {
                  console.error('[TOKEN RECOVERY] Failed:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
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
