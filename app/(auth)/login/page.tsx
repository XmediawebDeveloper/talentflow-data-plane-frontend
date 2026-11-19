'use client';

import { Suspense } from 'react';
import Login from '@/components/auth/Login';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AUTH_THEME_CSS } from '@/components/auth/authTheme';

function LoginContent() {
  const router = useRouter();

  return (
    <Login
      onBackToPublic={() => router.push('/')}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      // Painted with the same tokens as the page it precedes, so the swap from
      // fallback to form is a single flat surface with no colour shift.
      <div className="tf-auth tf-auth--login">
        <style>{AUTH_THEME_CSS}</style>
        <Loader2 className="tf-auth-spin" style={{ width: 26, height: 26, color: 'var(--tf-brand-ink)' }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
