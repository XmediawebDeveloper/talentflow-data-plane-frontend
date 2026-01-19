'use client';

import { Suspense } from 'react';
import SignUp from '@/components/auth/SignUp';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <SignUpContent />
    </Suspense>
  );
}
