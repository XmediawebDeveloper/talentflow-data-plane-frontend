import { redirect } from 'next/navigation';

export default function TeamUsageRedirect() {
  redirect('/organization/team-management');
}
