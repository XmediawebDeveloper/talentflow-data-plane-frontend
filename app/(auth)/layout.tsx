import { ReactNode } from 'react';
import { Header } from "@/components/marketing/Header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667EEA] via-[#764BA2] to-[#F093FB]">
      <Header />
      {children}
    </div>
  );
}
