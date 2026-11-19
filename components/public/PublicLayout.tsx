import { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";

interface PublicLayoutProps {
  children: ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  onLogin: () => void;
  onSignup: () => void;
}

export function PublicLayout({
  children,
  activePage,
  onNavigate,
  onLogin,
  onSignup,
}: PublicLayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-white dark:bg-[var(--raw-0f172a)] transition-colors duration-300">
      <PublicHeader
        activePage={activePage}
        onNavigate={onNavigate}
        onLogin={onLogin}
        onSignup={onSignup}
      />
      <main className="flex-1">{children}</main>
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}
