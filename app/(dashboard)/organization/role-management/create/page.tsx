import { redirect } from 'next/navigation';

// Roles are created in a popup on the Role Management page now.
export default function CreateRolePage() {
  redirect('/organization/role-management');
}
