'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import EditRoleForm from '@/components/roles/EditRoleForm';

export default function EditRolePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const roleId = parseInt(params.id);

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
