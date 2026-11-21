'use client';

import SupportDesk from '@/components/support/desk/SupportDesk';

/*
 * Support Tickets — every role on one page (components/support/desk):
 *   tenant admin  My Support Tickets · Team Support Tickets · Unit Disputes
 *   others        My Requests (to their administrator) · Unit Disputes
 * A user's ticket goes ONLY to Team Support Tickets (their tenant admin) and
 * reaches My Support Tickets / the Control Plane only when the admin clicks
 * Forward to support.
 */
export default function SupportTicketsPage() {
  return <SupportDesk />;
}
