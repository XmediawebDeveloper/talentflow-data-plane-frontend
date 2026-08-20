'use client';

import { Suspense } from 'react';
import Login from '@/components/auth/Login';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function LoginContent() {
  const router = useRouter();

  return (
    <Login
      onBackToPublic={() => router.push('/')}
      onSwitchToSignUp={() => router.push('/signup')}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
