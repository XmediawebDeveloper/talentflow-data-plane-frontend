'use client';

import SupportCenter from '@/components/SupportCenter';
import InternalHelpDesk from '@/components/InternalHelpDesk';
import { useAuth } from '@/lib/hooks/useAuth';

/*
 * A user's ticket goes ONLY to Team Support Tickets (their tenant admin) and
 * reaches My Support Tickets / the Control Plane only when the admin clicks
 * Forward Ticket. So non-admins raise tickets here through the Help Desk
 * (Team tickets); the Support Center (My + Team tabs) is the tenant admin's view.
 */
export default function SupportTicketsPage() {
  const { user, isTenantAdmin } = useAuth();

  // Role not known yet — don't flash the wrong view.
  if (!user) return null;

  if (!isTenantAdmin) return <InternalHelpDesk />;

  return (
    <div className="tf-page relative flex flex-col">
      <SupportCenter isAdmin />
    </div>
  );
}
