'use client';

import { useParams } from 'next/navigation';
import { MobileEnvironmentVerificationPortal } from '@/components/candidate/MobileEnvironmentVerificationPortal';

export default function EnvironmentVerificationPage() {
  const params = useParams();
  const token = params.token as string;

  return <MobileEnvironmentVerificationPortal token={token} />;
}
