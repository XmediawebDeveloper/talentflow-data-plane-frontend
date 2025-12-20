'use client';

import { useRouter } from 'next/navigation';
import JDCreation from '@/components/JDCreation';

export default function JDCreationPage() {
  const router = useRouter();

  const handleViewAllJobs = () => {
    router.push('/recruitment/job-openings');
  };

  return <JDCreation onBack={handleViewAllJobs} />;
}
