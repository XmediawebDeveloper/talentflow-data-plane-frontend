'use client';

import SignUp from '@/components/auth/SignUp';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();

  return (
    <SignUp
      onSwitchToLogin={() => router.push('/login')}
      onBackToPublic={() => router.push('/')}
    />
  );
}
