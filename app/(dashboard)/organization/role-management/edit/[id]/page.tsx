import { redirect } from 'next/navigation';

// Roles are edited in a popup on the Role Management page now.
export default function EditRolePage() {
  redirect('/organization/role-management');
}
