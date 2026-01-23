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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logos/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/logos/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logos/favicon.png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <ModalProvider>
              <ScoringProgressProvider>
                {children}
                <Toaster position="top-right" richColors closeButton />
                {/* Global subscription inactive modal - catches events from API interceptor */}
                <SubscriptionInactiveModal />
                {/* Global scoring progress indicator - shows on all pages */}
                <GlobalScoringProgressIndicator />
              </ScoringProgressProvider>
            </ModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
