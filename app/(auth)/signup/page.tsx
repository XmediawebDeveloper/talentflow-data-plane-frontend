'use client';

import { Suspense } from 'react';
import SignUp from '@/components/auth/SignUp';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AUTH_THEME_CSS } from '@/components/auth/authTheme';

function SignUpContent() {
  const router = useRouter();

  return (
    <SignUp
      onSwitchToLogin={() => router.push('/login')}
      onBackToPublic={() => router.push('/')}
    />
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      // Same flat token-driven surface as Login's fallback — see that file.
      <div className="tf-auth">
        <style>{AUTH_THEME_CSS}</style>
        <Loader2 className="tf-auth-spin" style={{ width: 26, height: 26, color: 'var(--tf-brand-ink)' }} />
      </div>
    }>
      <SignUpContent />
    </Suspense>
  );
}
