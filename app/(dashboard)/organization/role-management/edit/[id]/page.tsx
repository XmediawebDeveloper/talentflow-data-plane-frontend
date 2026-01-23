'use client';

import EditRoleForm from '@/components/roles/EditRoleForm';

export default function EditRolePage({ params }: { params: { id: string } }) {
  return <EditRoleForm roleId={parseInt(params.id)} />;
}
