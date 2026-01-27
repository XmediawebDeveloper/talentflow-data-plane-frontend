'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import EditRoleForm from '@/components/roles/EditRoleForm';

export default function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  // Unwrap the params Promise using React.use()
  const resolvedParams = use(params);
  const roleId = parseInt(resolvedParams.id);

  // Validate role ID
  useEffect(() => {
    if (isNaN(roleId) || roleId <= 0) {
      toast.error('Invalid role ID');
      router.push('/organization/role-management');
    }
  }, [roleId, router]);

  // Don't render the form if ID is invalid
  if (isNaN(roleId) || roleId <= 0) {
    return null;
  }

  return <EditRoleForm roleId={roleId} />;
}
