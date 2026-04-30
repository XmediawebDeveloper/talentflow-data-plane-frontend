import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ModalProvider } from "@/components/providers/ModalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ScoringProgressProvider } from "@/contexts/ScoringProgressContext";
import { Toaster } from "sonner";
import SubscriptionInactiveModal from "@/components/SubscriptionInactiveModal";
import GlobalScoringProgressIndicator from "@/components/GlobalScoringProgressIndicator";
import { GlobalDialogProvider } from "@/components/providers/GlobalDialogProvider";

const inter = Inter({ subsets: ["latin"] });

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
                  {children}
                  <Toaster position="top-right" richColors closeButton />
                  {/* Global subscription inactive modal - catches events from API interceptor */}
                  <SubscriptionInactiveModal />
                  {/* Global scoring progress indicator - floating bottom-right widget */}
                  <GlobalScoringProgressIndicator />
                </ScoringProgressProvider>
              </GlobalDialogProvider>
            </ModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
