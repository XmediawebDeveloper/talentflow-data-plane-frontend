import { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Header } from "@/components/marketing/Header";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Middleware sets x-tenant-subdomain for subdomain requests (e.g. xmedia.0sms.com).
  // On subdomain auth pages the marketing header should never appear — skip it entirely
  // to avoid a flash of the nav bar before client-side hydration hides it.
  const tenantSubdomain = (await headers()).get('x-tenant-subdomain');

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#667EEA] via-[#764BA2] to-[#F093FB]">
      {!tenantSubdomain && <Header />}
      {children}
    </div>
  );
}
